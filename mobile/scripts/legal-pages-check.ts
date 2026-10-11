import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import appJson from '../app.json';
import {
  GITHUB_PAGES_APP_PATH,
  githubPagesAccountDeletionUrl,
  githubPagesLegalUrl,
} from '../config/legalPages.ts';
import { SUPPORT_EMAIL } from '../config/support.ts';
import { AUTH_MINIMUM_AGE, AUTH_SIGN_UP_NOTE } from '../config/authConfig.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');
const publicDir = path.join(mobileRoot, 'public');

const baseUrl = (appJson.expo?.experiments as { baseUrl?: string } | undefined)?.baseUrl ?? '';
const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
assert.equal(GITHUB_PAGES_APP_PATH, normalized);

const deletionUrl = githubPagesAccountDeletionUrl();

for (const file of ['privacy.html', 'terms.html']) {
  const full = path.join(publicDir, file);
  assert.ok(fs.existsSync(full), `missing public/${file}`);
  const html = fs.readFileSync(full, 'utf8');
  assert.ok(!html.includes('Template notice'), `${file} should not contain template notice`);
  assert.ok(html.includes(SUPPORT_EMAIL), `${file} should list support contact`);
  assert.ok(!html.includes('davidjones21354@gmail.com'), `${file} should not list old personal email`);
}

const privacyHtml = fs.readFileSync(path.join(publicDir, 'privacy.html'), 'utf8');
assert.ok(privacyHtml.includes(deletionUrl), 'privacy.html should link to web account deletion page');

assert.equal(githubPagesLegalUrl('privacy'), `https://mealplanatic.app${normalized}/privacy`);

// --- Minimum age: one number, the same on both pages and at sign-up (Gemini API terms bar under-18 apps) ---
const termsHtml = fs.readFileSync(path.join(publicDir, 'terms.html'), 'utf8');
assert.equal(AUTH_MINIMUM_AGE, 18);
assert.ok(termsHtml.includes(`You must be ${AUTH_MINIMUM_AGE} or older to use MealPlanatic.`), 'terms state the minimum age');
assert.ok(privacyHtml.includes(`not intended for anyone under ${AUTH_MINIMUM_AGE}`), 'privacy page states the same age');
assert.ok(AUTH_SIGN_UP_NOTE.includes(`${AUTH_MINIMUM_AGE} or older`), 'sign-up note states the same age');
for (const [name, html] of [['terms.html', termsHtml], ['privacy.html', privacyHtml]] as const) {
  assert.doesNotMatch(html, /\b13\b(?! months)/, `${name} should not mention age 13`);
}
const authSheet = fs.readFileSync(path.join(mobileRoot, 'components/account/AuthSheet.tsx'), 'utf8');
assert.match(authSheet, /mode === 'sign-up' \? \(\s*<Text[^>]*>\{AUTH_SIGN_UP_NOTE\}<\/Text>/, 'the age line shows on the sign-up tab');

// --- YouTube API Services: terms bind users to YouTube's terms; privacy links Google's policy ---
assert.ok(termsHtml.includes('https://www.youtube.com/t/terms'), 'terms link the YouTube Terms of Service');
assert.ok(privacyHtml.includes('http://www.google.com/policies/privacy'), 'privacy page links the Google privacy policy');
assert.ok(termsHtml.includes('Ask Forky'), 'terms disclaimer names the AI chat');

console.log('legal-pages-check: ok');
