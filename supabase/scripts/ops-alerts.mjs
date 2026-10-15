/**
 * Owner alerts: reads recent edge function logs from the Supabase Management API and opens
 * (or comments on) a GitHub issue labelled `ops-alert` when something needs the owner.
 * GitHub emails the repo owner on new issues and comments, so no extra service is needed.
 *
 * Run by .github/workflows/ops-alerts.yml. Plain Node 22, no npm dependencies.
 * Unit tests: node --test supabase/scripts/ops-alerts.test.mjs
 *
 * Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, GITHUB_TOKEN, GITHUB_REPOSITORY,
 *      WINDOW_MINUTES (default 35), DRY_RUN=1 (print the issue text instead of posting).
 */

export const LABEL = 'ops-alert';
export const THRESHOLDS = {
  alertLines: 1, // any console line containing the word ALERT (e.g. pantry-vision billing refusal)
  aiCredit: 1, // AI provider says 402 / credits depleted / quota exhausted
  aiRateLimit: 5, // AI provider 429s (single ones are retried, so only a burst counts)
  aiModelGone: 3, // AI model retired (404 / "no longer available")
  fn5xx: 5, // 5xx responses from one function in the window
};
// Same alert reason is not repeated within this many hours (one email per problem, not 48 a day).
export const REPEAT_HOURS = 3;
// "Could not read logs" is posted at most once a day.
export const READ_FAILURE_HOURS = 24;

/** HTTP status + function name for every function invocation, grouped. */
export const EDGE_SQL = `select extract(log_attributes['request.pathname'], '^/functions/v1/([^/?]+)') as fn,
  log_attributes['function_id'] as function_id,
  toInt32OrZero(log_attributes['response.status_code']) as status,
  count() as n
from logs
where source = 'function_edge_logs'
group by fn, function_id, status
limit 1000`;

/** Console warnings/errors and any ALERT line from inside the functions. */
export const CONSOLE_SQL = `select timestamp,
  log_attributes['function_id'] as function_id,
  log_attributes['level'] as level,
  substring(event_message, 1, 400) as msg
from logs
where source = 'function_logs'
  and (position(event_message, 'ALERT') > 0 or log_attributes['level'] in ('error', 'warn', 'warning'))
order by timestamp desc
limit 500`;

/** Strip anything that could identify a person or leak a credential. Keeps it short. */
export function sanitize(text, maxLength = 200) {
  let s = String(text ?? '');
  s = s.replace(/[\r\n\t]+/g, ' ');
  s = s.replace(/eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){0,2}/g, '[jwt]');
  s = s.replace(/\b(?:sk|pk|rk|whsec|sbp|sb_secret|sb_publishable)_[A-Za-z0-9_-]{6,}/gi, '[key]');
  s = s.replace(/\bsk-[A-Za-z0-9_-]{6,}/g, '[key]');
  s = s.replace(/\bAIza[0-9A-Za-z_-]{10,}/g, '[key]');
  s = s.replace(/\bgh[pousr]_[A-Za-z0-9]{10,}/g, '[key]');
  s = s.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]');
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  s = s.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]');
  s = s.replace(/\b(?:sub|cus|pi|cs|ch|evt|price|prod|seti|pm|si)_[A-Za-z0-9]{8,}/g, '[stripe-id]');
  s = s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]');
  s = s.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1');
  s = s.replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}/g, '[long-token]');
  s = s.replace(/`/g, "'");
  s = s.trim();
  return s.length > maxLength ? `${s.slice(0, maxLength - 1)}…` : s;
}

/** Which bucket a console line belongs to, or null. */
export function classifyLine(msg) {
  const text = String(msg ?? '');
  if (/\bALERT\b/.test(text)) return 'alertLines';
  if (/\(402\)|model error 402|credits? (?:are |is )?(?:depleted|exhausted)|credit balance|insufficient[_ ]credit|RESOURCE_EXHAUSTED|quota exceeded/i.test(text)) return 'aiCredit';
  if (/\(429\)|model error 429|rate.?limit/i.test(text)) return 'aiRateLimit';
  if (/\(404\).*no longer available|no longer available to new users|model .*not found/i.test(text)) return 'aiModelGone';
  return null;
}

/**
 * Turns the two query results into a list of findings over the thresholds.
 * edgeRows: [{fn, function_id, status, n}]; consoleRows: [{function_id, level, msg}]
 */
export function evaluate(edgeRows = [], consoleRows = [], thresholds = THRESHOLDS) {
  const nameById = new Map();
  const fiveXx = new Map();
  let invocations = 0;
  for (const row of edgeRows) {
    const fn = row.fn || 'unknown';
    if (row.function_id && row.fn) nameById.set(row.function_id, row.fn);
    const n = Number(row.n) || 0;
    invocations += n;
    if (Number(row.status) >= 500) fiveXx.set(fn, (fiveXx.get(fn) ?? 0) + n);
  }

  const buckets = { alertLines: [], aiCredit: [], aiRateLimit: [], aiModelGone: [] };
  let errorLines = 0;
  for (const row of consoleRows) {
    if (row.level === 'error') errorLines += 1;
    const kind = classifyLine(row.msg);
    if (!kind) continue;
    const fn = nameById.get(row.function_id) ?? /^\[?([a-z0-9-]+)[\]:]/.exec(String(row.msg ?? ''))?.[1] ?? 'unknown';
    buckets[kind].push({ fn, msg: row.msg });
  }

  const labels = {
    alertLines: 'ALERT logged',
    aiCredit: 'AI credit or quota ran out',
    aiRateLimit: 'AI provider rate limiting',
    aiModelGone: 'AI model no longer available',
  };
  const findings = [];
  for (const [kind, lines] of Object.entries(buckets)) {
    if (lines.length >= thresholds[kind]) {
      const fns = [...new Set(lines.map((l) => l.fn))].sort();
      findings.push({ key: `${kind}:${fns.join(',')}`, reason: `${labels[kind]} (${fns.join(', ')})`, count: lines.length, samples: lines.slice(0, 5).map((l) => sanitize(l.msg)) });
    }
  }
  for (const [fn, count] of [...fiveXx.entries()].sort()) {
    if (count >= thresholds.fn5xx) {
      findings.push({ key: `fn5xx:${fn}`, reason: `${fn} failing (${count} server errors)`, count, samples: [] });
    }
  }
  return { findings, stats: { invocations, errorLines, fiveXx: Object.fromEntries(fiveXx) } };
}

/** A stable short signature so the same problem is not re-posted every 30 minutes. */
export function signature(findings) {
  return findings.map((f) => f.key).sort().join('|') || 'none';
}

export function issueTitle(findings) {
  const first = findings[0]?.reason ?? 'something needs a look';
  const more = findings.length > 1 ? ` (+${findings.length - 1} more)` : '';
  return `Alert: ${first}${more}`.slice(0, 120);
}

export function issueBody({ findings, stats, windowMinutes, sig, now = new Date() }) {
  const lines = [
    `Automatic check of the last ${windowMinutes} minutes of Supabase edge function logs (${now.toISOString()}).`,
    '',
  ];
  for (const f of findings) {
    lines.push(`**${f.reason}**: ${f.count} in the window`);
    if (f.samples.length) {
      lines.push('```', ...f.samples, '```');
    }
    lines.push('');
  }
  lines.push(`Function calls in window: ${stats.invocations}. Error lines: ${stats.errorLines}.`);
  lines.push('', 'Where to look: Supabase dashboard -> Edge Functions -> Logs. Close this issue once fixed; a new problem opens a new one.');
  lines.push(`<!-- ops-alert:sig=${sig} -->`);
  return lines.join('\n');
}

export function readFailureBody(status, now = new Date()) {
  return [
    `The alert check could not read the Supabase logs (${now.toISOString()}). Result: ${sanitize(status, 120)}.`,
    '',
    'Until this is fixed, function failures and AI credit outages will NOT be reported.',
    'Usual cause: the SUPABASE_ACCESS_TOKEN repository secret expired or was removed. Make a new token in the Supabase dashboard (Account -> Access Tokens) and update the secret in GitHub (Settings -> Secrets and variables -> Actions).',
    '<!-- ops-alert:sig=read-failure -->',
  ].join('\n');
}

/** True if a post with this signature was made within `hours` (looks at issue body + comments). */
export function postedRecently(posts, sig, hours, now = new Date()) {
  const marker = `<!-- ops-alert:sig=${sig} -->`;
  const cutoff = now.getTime() - hours * 3600 * 1000;
  return posts.some((p) => String(p.body ?? '').includes(marker) && new Date(p.created_at).getTime() >= cutoff);
}

// ---------- I/O (not unit tested: needs the live APIs) ----------

async function queryLogs({ token, ref, sql, start, end }) {
  const url = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs`);
  url.searchParams.set('sql', sql);
  url.searchParams.set('iso_timestamp_start', start.toISOString());
  url.searchParams.set('iso_timestamp_end', end.toISOString());
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`logs API HTTP ${res.status}`);
  const body = await res.json();
  if (body?.error) throw new Error(`logs API error: ${typeof body.error === 'string' ? body.error : JSON.stringify(body.error).slice(0, 200)}`);
  if (!Array.isArray(body?.result)) throw new Error('logs API returned no result array');
  return body.result;
}

function github(token, repo) {
  return async (method, path, body) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) throw new Error(`GitHub ${method} ${path} HTTP ${res.status}`);
    return res.status === 204 ? null : res.json();
  };
}

async function report(gh, { title, body, sig, hours, now }) {
  if (!(await gh('GET', `/labels/${LABEL}`))) {
    await gh('POST', '/labels', { name: LABEL, color: 'b60205', description: 'Automatic owner alert from ops-alerts.yml' });
    console.log(`created label ${LABEL}`);
  }
  const open = (await gh('GET', `/issues?labels=${LABEL}&state=open&per_page=1&sort=created&direction=desc`)) ?? [];
  if (open.length === 0) {
    const created = await gh('POST', '/issues', { title, body, labels: [LABEL] });
    console.log(`opened issue #${created.number}`);
    return;
  }
  const issue = open[0];
  const comments = (await gh('GET', `/issues/${issue.number}/comments?per_page=100`)) ?? [];
  if (postedRecently([issue, ...comments], sig, hours, now)) {
    console.log(`same alert already posted on #${issue.number} within ${hours}h; not repeating`);
    return;
  }
  await gh('POST', `/issues/${issue.number}/comments`, { body: `**${title}**\n\n${body}` });
  console.log(`commented on issue #${issue.number}`);
}

async function main() {
  const env = process.env;
  const windowMinutes = Number(env.WINDOW_MINUTES) || 35;
  const ref = env.SUPABASE_PROJECT_REF;
  const dryRun = env.DRY_RUN === '1';
  const now = new Date();
  const start = new Date(now.getTime() - windowMinutes * 60 * 1000);
  const gh = dryRun
    ? async () => {
        throw new Error('dry run');
      }
    : github(env.GITHUB_TOKEN, env.GITHUB_REPOSITORY);
  const post = async (args) => {
    if (dryRun) {
      console.log(`DRY RUN, would post:\n${args.title}\n\n${args.body}`);
      return;
    }
    await report(gh, { ...args, now });
  };

  let edgeRows;
  let consoleRows;
  try {
    if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN secret is not set');
    edgeRows = await queryLogs({ token: env.SUPABASE_ACCESS_TOKEN, ref, sql: EDGE_SQL, start, end: now });
    consoleRows = await queryLogs({ token: env.SUPABASE_ACCESS_TOKEN, ref, sql: CONSOLE_SQL, start, end: now });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    console.log(`::warning::could not read logs: ${sanitize(reason, 120)}`);
    await post({ title: 'Alert: alert check could not read logs', body: readFailureBody(reason, now), sig: 'read-failure', hours: READ_FAILURE_HOURS });
    return;
  }

  const { findings, stats } = evaluate(edgeRows, consoleRows);
  console.log(`window ${windowMinutes}m: ${stats.invocations} calls, ${stats.errorLines} error lines, ${findings.length} findings`);
  if (findings.length === 0) return;
  const sig = signature(findings);
  await post({ title: issueTitle(findings), body: issueBody({ findings, stats, windowMinutes, sig, now }), sig, hours: REPEAT_HOURS });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`ops-alerts failed: ${error instanceof Error ? sanitize(error.message, 200) : 'unknown'}`);
    process.exit(1);
  });
}
