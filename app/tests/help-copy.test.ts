/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_DELETE_COPY, SUPPORT_EMAIL as ACCOUNT_SUPPORT_EMAIL } from '../src/account/copy';
import { AUTH_SCREEN_COPY, LEGAL_LINKS } from '../src/auth/copy';
import { ASK_FORKY_COPY } from '../src/forky/copy';
import { CANCEL_LINE, DELETE_CANCELS_LINE, HELP_COPY, HELP_FAQ, HELP_LINKS, SUPPORT_EMAIL, perPlanList } from '../src/help/copy';
import { PLANS_COPY } from '../src/plans/copy';
import { INTERVAL_ORDER, tierRenewalDisclosure } from '../src/plans/pricing';
import { PAID_TIERS, PLAN_TIERS, TIER_LIMITS, TIER_NAMES } from '../src/scan/planTiers';

const answer = (id: string) => {
  const item = HELP_FAQ.find((q) => q.id === id);
  assert.ok(item, `no FAQ entry "${id}"`);
  return item.a;
};

test('support address is the live one, and Contact us mails it', () => {
  assert.equal(SUPPORT_EMAIL, ACCOUNT_SUPPORT_EMAIL);
  assert.equal(SUPPORT_EMAIL, 'support@mealplanatic.app');
  assert.equal(HELP_LINKS.contact, `mailto:${ACCOUNT_SUPPORT_EMAIL}`);
  assert.ok(answer('contact').includes(ACCOUNT_SUPPORT_EMAIL));
  assert.ok(HELP_COPY.contactBody.includes(ACCOUNT_SUPPORT_EMAIL));
});

test('Ask Forky answer carries the approved AI line word for word', () => {
  assert.equal(
    ASK_FORKY_COPY.aiNotice,
    'Forky is an AI helper and can be wrong. Always check allergens and food safety yourself before you cook. If you have saved allergens, they are sent with your question so Forky can avoid them.',
  );
  assert.ok(answer('forky').includes(ASK_FORKY_COPY.aiNotice));
});

test('cancel answer reuses the approved renewal line ending and the LIVE Manage subscription hint', () => {
  for (const tier of PAID_TIERS) {
    for (const interval of INTERVAL_ORDER) {
      assert.ok(tierRenewalDisclosure(tier, interval).endsWith(CANCEL_LINE), `${tier}/${interval}`);
    }
  }
  assert.equal(CANCEL_LINE, 'Cancel any time in Account, Manage subscription.');
  assert.ok(answer('cancel').startsWith(CANCEL_LINE));
  assert.ok(answer('cancel').includes(PLANS_COPY.manageHint));
});

test('delete answer points at Account, Delete account and reuses the delete page line', () => {
  assert.ok(ACCOUNT_DELETE_COPY.whatIsDeleted.includes(DELETE_CANCELS_LINE));
  assert.ok(answer('delete').includes(`Account, then ${ACCOUNT_DELETE_COPY.deleteButton}.`));
  assert.ok(answer('delete').includes(DELETE_CANCELS_LINE));
});

test('allowances in the answers are the plan table numbers', () => {
  for (const tier of PLAN_TIERS) {
    assert.ok(perPlanList('scans').includes(`${TIER_NAMES[tier]} ${TIER_LIMITS[tier].scans}`));
  }
  assert.ok(answer('scan').includes(perPlanList('scans')));
  assert.ok(answer('import').includes(perPlanList('imports')));
  assert.ok(answer('forky').includes(perPlanList('forkyQuestions')));
  assert.equal(perPlanList('scans'), 'Free 3, MealPlanatic Plus 15, MealPlanatic Pro 25, MealPlanatic Family 50');
});

test('policy links: same Terms and Privacy addresses and link words as sign-in; accessibility page on the site', () => {
  assert.equal(HELP_LINKS.terms, LEGAL_LINKS.terms);
  assert.equal(HELP_LINKS.privacy, LEGAL_LINKS.privacy);
  assert.equal(HELP_COPY.termsLink, AUTH_SCREEN_COPY.termsLink);
  assert.equal(HELP_COPY.privacyLink, AUTH_SCREEN_COPY.privacyLink);
  assert.equal(HELP_LINKS.accessibility, 'https://mealplanatic.app/accessibility.html');
});

test('a short FAQ: 5 to 7 questions with unique ids', () => {
  assert.ok(HELP_FAQ.length >= 5 && HELP_FAQ.length <= 7);
  assert.equal(new Set(HELP_FAQ.map((q) => q.id)).size, HELP_FAQ.length);
});
