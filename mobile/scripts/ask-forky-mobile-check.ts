/**
 * Old-app half of supabase/scripts/ask-forky-check.ts: what the old app sends, its screen rules,
 * the privacy page and the migration in mobile/. The function checks moved to supabase/scripts/.
 * Run from mobile/: npm run test:ask-forky
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASK_FORKY_COPY, ASK_FORKY_LIMITS as APP_LIMITS } from '../config/askForky.ts';
import { buildAskForkyBody, recentlyCookedTitles } from '../lib/forky/askForkyRequest.ts';
import { ASK_FORKY_LIMITS, parseForkyRequest } from '../../supabase/functions/_shared/askForkyText.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8');

// --- What the app sends: trimmed, soonest-to-expire first, nothing personal.
const body = buildAskForkyBody(
  '  What can I make?  ',
  Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? ('forky' as const) : ('user' as const), text: `turn ${i}` })),
  {
    pantry: [
      { name: 'Rice', quantity: 2, unit: 'lb', expiresOn: null },
      { name: 'Spinach', quantity: 1, unit: 'bag', expiresOn: '2026-10-10T00:00:00Z' },
      { name: 'Eggs', quantity: 0, unit: 'each', expiresOn: '2026-10-20' },
      ...Array.from({ length: 80 }, (_, i) => ({ name: `Item ${i}`, quantity: 1, unit: 'each', expiresOn: null })),
    ],
    recipes: Array.from({ length: 12 }, (_, i) => ({
      recipeId: `r${i}`,
      recipeName: `Recipe ${i}`,
      totalIngredients: 8,
      matchedCount: 6,
      missing: Array.from({ length: 9 }, (_, j) => ({ name: `missing ${j}` })),
    })),
  },
);
assert.equal(body.question, 'What can I make?');
assert.equal(body.history.length, APP_LIMITS.historyTurns);
assert.equal(body.pantry.length, APP_LIMITS.pantryItems);
assert.deepEqual(body.pantry[0], { name: 'Spinach', amount: '1 bag', expiresOn: '2026-10-10' });
assert.deepEqual(body.pantry[1], { name: 'Eggs', expiresOn: '2026-10-20' }, 'zero quantity sends no amount');
assert.equal(body.recipes.length, APP_LIMITS.recipes);
assert.equal(body.recipes[0].missing.length, 6);
assert.deepEqual(Object.keys(body).sort(), ['history', 'pantry', 'question', 'recipes']);
// App and server agree on the limits the user can see.
assert.equal(APP_LIMITS.questionChars, ASK_FORKY_LIMITS.questionChars);
assert.equal(APP_LIMITS.historyTurns, ASK_FORKY_LIMITS.historyTurns);
assert.equal(APP_LIMITS.pantryItems, ASK_FORKY_LIMITS.pantryItems);
assert.equal(APP_LIMITS.recipes, ASK_FORKY_LIMITS.recipes);

// --- The server accepts what the app sends.
const good = parseForkyRequest(body);
assert.ok(good.ok);

// --- Migration.
const migration = read('supabase/migrations/20261009210000_ask_forky_usage.sql');
assert.match(migration, /messages < p_limit/);
assert.match(migration, /revoke all on function public\.claim_forky_message\(uuid, text, integer\) from public, anon, authenticated/);
assert.match(migration, /values \('askForky', false\)/);
assert.doesNotMatch(migration, /^\s*(question|answer|content|message_text)\s+text\b/im, 'no column holds chat text');

// --- App rules.
const client = read('lib/forky/askForky.ts');
assert.doesNotMatch(client + read('components/forkinator/AskForkySheet.tsx'), /anthropic|x-api-key|claude-/i, 'the app never talks to the model');
assert.match(client, /functions\/v1\/ask-forky/);
const sheet = read('components/forkinator/AskForkySheet.tsx');
assert.match(sheet, /ASK_FORKY_COPY\.aiNotice/, 'AI notice is on the screen');
assert.match(ASK_FORKY_COPY.aiNotice, /AI helper/);
assert.match(ASK_FORKY_COPY.aiNotice, /allergens and food safety/);
assert.match(sheet, /recipeTitles\.get\(recipeId\)/, 'only known recipes get a button');
assert.doesNotMatch(sheet, /bg-tomato/, 'tomato is for purchase buttons only');
assert.doesNotMatch(sheet, /localStorage|AsyncStorage/, 'chat is not saved on the device either');
const tapHeights = [...sheet.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
assert.ok(tapHeights.length >= 6 && tapHeights.every((h) => h >= 44));
for (const value of Object.values(ASK_FORKY_COPY)) {
  if (typeof value === 'string') assert.doesNotMatch(value, /save \$|\d+ ?% off|free forever|unlimited/i, value);
}
// Opened by tapping the floating Forky (owner's choice, Oct 9), not from a Home button.
const overlay = read('components/forkinator/ForkinatorOverlay.tsx');
assert.match(overlay, /\(featureFlags\.askForky \|\| profile\.role === 'admin'\) && !demoMode/, 'hidden unless switched on (admins can try it)');
assert.match(overlay, /if \(askForkyAvailable\) setAskForkyOpen\(true\);/);
assert.match(overlay, /\{askForkyAvailable \? \(\s*<AskForkySheet/);
assert.doesNotMatch(read('app/(tabs)/index.tsx'), /AskForky|askForky/, 'no Ask Forky entry on Home');
assert.match(read('config/appConfig.ts'), /askForky: false/);
// Privacy page names the AI provider before the switch can be turned on (compliance rule 2).
const privacy = read('public/privacy.html');
assert.match(privacy, /Ask Forky/);
assert.match(privacy, /Anthropic/);

// --- Household profile (learning step 4): what the app sends.
const profileContext = { pantry: [], recipes: [] };
assert.equal('household' in buildAskForkyBody('q', [], profileContext), false, 'left out when there is nothing to say');
assert.equal(
  'household' in buildAskForkyBody('q', [], { ...profileContext, household: { householdSize: 0, usualItems: [' '], cookedRecently: [] } }),
  false,
);
const withHousehold = buildAskForkyBody('q', [], {
  ...profileContext,
  household: {
    householdSize: 4,
    usualItems: Array.from({ length: 20 }, (_, i) => `Item ${i}`),
    cookedRecently: Array.from({ length: 9 }, (_, i) => `Meal ${i}`),
  },
});
assert.equal(withHousehold.household?.size, 4);
assert.equal(withHousehold.household?.usualItems?.length, APP_LIMITS.usualItems);
assert.equal(withHousehold.household?.cookedRecently?.length, APP_LIMITS.cookedRecently);
assert.deepEqual(Object.keys(withHousehold.household ?? {}).sort(), ['cookedRecently', 'size', 'usualItems']);
// Meals made in the last 30 days, newest first, no repeats, nothing from the future or unmade.
const cookedNow = new Date('2026-10-11T12:00:00Z');
assert.deepEqual(
  recentlyCookedTitles(
    [
      { title: 'Chili', made: true, madeAt: '2026-10-01T00:00:00Z' },
      { title: 'Tacos', made: true, madeAt: '2026-10-09T00:00:00Z' },
      { title: 'tacos', made: true, madeAt: '2026-10-03T00:00:00Z' },
      { title: 'Old stew', made: true, madeAt: '2026-08-01T00:00:00Z' },
      { title: 'Planned pasta', made: false, madeAt: null },
      { title: 'Time travel', made: true, madeAt: '2026-11-01T00:00:00Z' },
    ],
    cookedNow,
  ),
  ['Tacos', 'Chili'],
);
// The app never sends diet or allergy settings to the chat.
const chatSheetSource = read('components/forkinator/AskForkySheet.tsx');
assert.doesNotMatch(chatSheetSource, /dietaryNotes|userDietPrefs|allerg/i);
const privacyFlat = privacy.replace(/\s+/g, ' ');
assert.match(privacyFlat, /household size, the names of items you buy regularly, and the titles of meals you recently marked as made/);
assert.match(privacyFlat, /do not send your name, email, photos, or your dietary and allergy settings/);

console.log('ask-forky-mobile-check: ok');
