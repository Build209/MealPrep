#!/usr/bin/env node
// Bulk-load Wikibooks Cookbook recipes into public.library_recipes as DRAFTS.
//
//   node db/scripts/wikibooks/load.mjs                 dry run (default): counts + one sample row, NO network
//   node db/scripts/wikibooks/load.mjs --apply         real run: needs env SUPABASE_ACCESS_TOKEN
//
// Options: --file <path> (default db/data/wikibooks-recipes.json), --batch-size <n> (default 100).
// Env: SUPABASE_PROJECT_REF (default okkwapgyadpaifpmkcex).
//
// Safety: every row is inserted as status 'draft'. A slug that already exists is only updated when
// that existing row is itself a draft from 'Wikibooks Cookbook'; published rows and rows from any
// other source are never touched (the ON CONFLICT ... WHERE below). Nothing is ever deleted.
// The access token is read from the environment and is never printed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const SOURCE_NAME = 'Wikibooks Cookbook';
export const LICENSE = 'CC BY-SA 4.0';
export const REVIEW_NOTES = 'Wikibooks import; ingredient lines parsed mechanically; servings defaulted to 4 when missing';
export const DEFAULT_PROJECT_REF = 'okkwapgyadpaifpmkcex';
export const DEFAULT_BATCH_SIZE = 100;

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = resolve(HERE, '..', '..', 'data', 'wikibooks-recipes.json');

/** A dollar-quote tag whose `$tag$` delimiter does not occur in the payload. */
export function pickDollarTag(payload) {
  for (const base of ['j', 'wb', 'wbj', 'recipes', 'rows']) {
    if (!payload.includes(`$${base}$`)) return base;
  }
  for (let i = 1; i < 10000; i++) {
    const t = `wb${i}`;
    if (!payload.includes(`$${t}$`)) return t;
  }
  throw new Error('could not find a free dollar-quote tag');
}

/** Split rows into consecutive batches of at most `size`. */
export function batches(rows, size = DEFAULT_BATCH_SIZE) {
  if (!Number.isInteger(size) || size < 1) throw new Error('batch size must be a positive integer');
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Single-quoted SQL string literal (only used for fixed constants, never for recipe text). */
function lit(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * Build one INSERT for a batch of rows. Recipe text only ever travels inside a dollar-quoted jsonb
 * literal, so no per-field escaping is needed.
 */
export function buildInsertSql(rows) {
  const payload = JSON.stringify(
    rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      url: r.url,
      servings: r.servings ?? null,
      tag: r.tag ?? null,
      ingredients: r.ingredients,
      steps: r.steps,
    })),
  );
  const tag = pickDollarTag(payload);
  const q = `$${tag}$`;
  return [
    'INSERT INTO public.library_recipes (slug,title,dish_name,servings,ingredients,steps,tags,cuisine,status,review_notes,source_name,source_url,license)',
    'SELECT x.slug, x.title, x.title,',
    '  COALESCE(NULLIF(x.servings, 0), 4),',
    '  x.ingredients, x.steps,',
    "  CASE WHEN x.tag IS NULL OR x.tag = '' THEN '{}'::text[] ELSE ARRAY[x.tag] END,",
    `  NULL, 'draft', ${lit(REVIEW_NOTES)}, ${lit(SOURCE_NAME)}, x.url, ${lit(LICENSE)}`,
    `FROM jsonb_to_recordset(${q}${payload}${q}::jsonb) AS x(slug text,title text,url text,servings int,tag text,ingredients jsonb,steps jsonb)`,
    'ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, ingredients=EXCLUDED.ingredients, steps=EXCLUDED.steps, tags=EXCLUDED.tags, servings=EXCLUDED.servings, source_url=EXCLUDED.source_url',
    `WHERE library_recipes.status='draft' AND library_recipes.source_name=${lit(SOURCE_NAME)}`,
    'RETURNING (xmax = 0) AS inserted',
  ].join('\n');
}

export const COUNTS_SQL =
  'select status, source_name, count(*)::int as n from public.library_recipes group by status, source_name order by status, source_name';

export function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('no rows in input file');
  const seen = new Set();
  for (const r of rows) {
    if (!r.slug || !r.title || !r.url) throw new Error(`row missing slug/title/url: ${JSON.stringify(r).slice(0, 120)}`);
    if (seen.has(r.slug)) throw new Error(`duplicate slug in input: ${r.slug}`);
    seen.add(r.slug);
    if (!Array.isArray(r.ingredients) || !Array.isArray(r.steps)) throw new Error(`bad ingredients/steps: ${r.slug}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST a query to the Management API. Retries 429 / 5xx / network errors with backoff. */
export async function runQuery({ ref, token, query, fetchImpl = fetch, maxAttempts = 6, baseDelayMs = 1000 }) {
  const url = `https://api.supabase.com/v1/projects/${ref}/database/query`;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (res.ok) return await res.json();
      const text = (await res.text()).slice(0, 500);
      lastErr = new Error(`HTTP ${res.status}: ${text}`);
      if (res.status !== 429 && res.status < 500) throw Object.assign(lastErr, { fatal: true });
      const ra = Number(res.headers?.get?.('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : baseDelayMs * 2 ** (attempt - 1));
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
      if (attempt < maxAttempts) await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw new Error(`gave up after ${maxAttempts} attempts: ${lastErr?.message ?? lastErr}`);
}

export function parseArgs(argv) {
  const o = { apply: false, dryRun: false, file: DEFAULT_FILE, batchSize: DEFAULT_BATCH_SIZE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--file') o.file = resolve(argv[++i]);
    else if (a === '--batch-size') o.batchSize = Number(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (o.apply && o.dryRun) throw new Error('--apply and --dry-run cannot be combined');
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rows = JSON.parse(readFileSync(opts.file, 'utf8'));
  validateRows(rows);
  const parts = batches(rows, opts.batchSize);
  const tags = new Set(rows.map((r) => r.tag).filter(Boolean));
  const noServ = rows.filter((r) => !r.servings).length;
  console.log(`rows: ${rows.length}  batches: ${parts.length} (size ${opts.batchSize})  distinct tags: ${tags.size}  servings missing (default 4): ${noServ}`);

  if (!opts.apply) {
    const sample = rows[Math.floor(rows.length / 2)];
    console.log('DRY RUN: no API call made. Sample row:');
    console.log(JSON.stringify(sample, null, 2).slice(0, 1500));
    const sql = buildInsertSql(parts[0]);
    console.log(`first batch SQL: ${sql.length} chars, ${sql.split('\n').length} lines; head:`);
    console.log(sql.split('\n').slice(0, 8).join('\n').slice(0, 900));
    console.log('Re-run with --apply (and SUPABASE_ACCESS_TOKEN set) to load as drafts.');
    return;
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
  const ref = process.env.SUPABASE_PROJECT_REF || DEFAULT_PROJECT_REF;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (let i = 0; i < parts.length; i++) {
    const out = await runQuery({ ref, token, query: buildInsertSql(parts[i]) });
    const ret = Array.isArray(out) ? out : [];
    const ins = ret.filter((r) => r.inserted === true).length;
    inserted += ins;
    updated += ret.length - ins;
    skipped += parts[i].length - ret.length;
    console.log(`batch ${i + 1}/${parts.length}: inserted ${ins}, updated ${ret.length - ins}, skipped ${parts[i].length - ret.length}`);
  }
  console.log(`done: inserted ${inserted}, updated ${updated}, skipped (slug taken by a published or other-source row) ${skipped}`);

  const counts = await runQuery({ ref, token, query: COUNTS_SQL });
  console.log('library_recipes by status and source (read-only query):');
  for (const r of counts) console.log(`  ${r.status}\t${r.source_name ?? '(none)'}\t${r.n}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`error: ${e.message}`);
    process.exit(1);
  });
}
