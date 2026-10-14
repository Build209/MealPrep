// Merges the per-screen results of the phone tour (phone-screens/<project>/<NN>-<screen>.json,
// written by e2e/phone-checks.ts) into phone-screens/phone-report.json and phone-report.md.
//
//   node e2e/phone-report.mjs [dir]      default: phone-screens
//
// Always exits 0: Playwright already failed the run if a check failed; this only writes the summary.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'phone-screens');
if (!existsSync(dir)) {
  console.log(`No ${dir}: the tour wrote nothing.`);
  process.exit(0);
}

const screens = [];
for (const project of readdirSync(dir).sort()) {
  const pdir = join(dir, project);
  if (!statSync(pdir).isDirectory()) continue;
  for (const file of readdirSync(pdir).sort()) {
    if (!file.endsWith('.json')) continue;
    try {
      screens.push(JSON.parse(readFileSync(join(pdir, file), 'utf8')));
    } catch (error) {
      console.log(`Skipping ${project}/${file}: ${error}`);
    }
  }
}

const passed = (s) => Object.values(s.checks).every(Boolean);
const meta = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? null,
  ref: process.env.GITHUB_REF_NAME ?? null,
  run: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  engines: Object.fromEntries([...new Set(screens.map((s) => s.project))].map((p) => [p, screens.find((s) => s.project === p).engine])),
  screens: screens.length,
  screensPassing: screens.filter(passed).length,
};
writeFileSync(join(dir, 'phone-report.json'), `${JSON.stringify({ ...meta, results: screens }, null, 2)}\n`);

const tick = (ok) => (ok ? 'yes' : '**NO**');
const esc = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lines = [
  '# Phone pass report',
  '',
  `Commit ${meta.commit ?? '(local)'}${meta.ref ? ` on ${meta.ref}` : ''}. ${meta.run ? `Run: ${meta.run}. ` : ''}Generated ${meta.generatedAt}.`,
  '',
  `Engines: ${Object.entries(meta.engines).map(([p, e]) => `${p} = ${e}`).join(', ') || 'none'}.`,
  `Screens passing all checks: ${meta.screensPassing} of ${meta.screens}.`,
  '',
  'Checks: no sideways scroll; tap targets at least 44x44 px; no clipped text; tomato only for camera or money.',
  'Screens missing below did not reach their screenshot (see the Playwright output).',
  '',
  '| Project | Screen | Route | Sideways | Tap | Text | Tomato rule | Tomato uses | Screenshot |',
  '|---|---|---|---|---|---|---|---|---|',
];
for (const s of screens) {
  lines.push(
    `| ${s.project} | ${s.order} ${s.screen} | \`${esc(s.route)}\` | ${tick(s.checks.noSidewaysScroll)} | ${tick(s.checks.tapTargets)} | ${tick(
      s.checks.textFits,
    )} | ${tick(s.checks.tomatoRule)} | ${s.tomato.length} | ${s.screenshots.map((p) => `[${p.split('/').pop()}](${p})`).join(' ')} |`,
  );
}
lines.push('', '## Details per screen', '');
for (const s of screens) {
  lines.push(`### ${s.project} / ${s.order} ${s.screen}`, '');
  lines.push(`Route \`${s.route}\`, viewport ${s.viewport}, purpose ${s.purpose}, engine ${s.engine}.`, '');
  if (!s.checks.noSidewaysScroll) lines.push(`- Sideways scroll: page is ${s.sidewaysScroll.scrollWidth}px wide in ${s.sidewaysScroll.innerWidth}px.`);
  for (const t of s.tapTargetIssues) lines.push(`- Tap target too small: ${t.role} "${esc(t.text)}" ${t.width}x${t.height}`);
  for (const t of s.tapTargetAllowed) lines.push(`- Small but allowed (${t.why}): ${t.role} "${esc(t.text)}" ${t.width}x${t.height}`);
  for (const c of s.clippedText) lines.push(`- Text ${c.kind}: "${esc(c.text)}" content ${c.scroll} in box ${c.client}`);
  for (const c of s.truncatedText) lines.push(`- Truncated on purpose (ellipsis/line clamp): "${esc(c.text)}"`);
  for (const o of s.offscreenControls) lines.push(`- Control partly off screen (note): "${esc(o)}"`);
  for (const t of s.tomato)
    lines.push(`- Tomato ${t.props.join('+')} on <${t.tag}> "${esc(t.text)}": context ${t.context}${s.tomatoViolations.includes(t) || (s.purpose === 'none' && t.context === 'none') ? ' **(violation)**' : ''}`);
  for (const n of s.notes) lines.push(`- Note: ${esc(n)}`);
  lines.push('');
}
writeFileSync(join(dir, 'phone-report.md'), `${lines.join('\n')}\n`);
console.log(`Wrote ${join(dir, 'phone-report.json')} and phone-report.md: ${meta.screensPassing} of ${meta.screens} screens pass.`);
