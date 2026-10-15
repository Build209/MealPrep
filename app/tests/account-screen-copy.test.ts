/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_DELETE_COPY, ACCOUNT_DELETE_ERRORS, ACCOUNT_SCREEN_COPY } from '../src/account/copy';
import { PLANS_COPY } from '../src/plans/copy';
import { PAID_TIERS } from '../src/scan/planTiers';
import { INTERVAL_ORDER, tierRenewalDisclosure } from '../src/plans/pricing';

test('the approved renewal line names the Account screen title and its Manage subscription button', () => {
  const where = `Cancel any time in ${ACCOUNT_SCREEN_COPY.title}, ${PLANS_COPY.manage}.`;
  for (const tier of PAID_TIERS) {
    for (const interval of INTERVAL_ORDER) {
      assert.ok(
        tierRenewalDisclosure(tier, interval).endsWith(where),
        `renewal line for ${tier}/${interval} no longer matches the Account screen: ${where}`,
      );
    }
  }
});

test('Account reuses existing words verbatim', () => {
  assert.equal(ACCOUNT_SCREEN_COPY.title, 'Account');
  assert.equal(PLANS_COPY.manage, 'Manage subscription');
  assert.equal(ACCOUNT_SCREEN_COPY.plansLink, 'Plans & usage');
  assert.equal(ACCOUNT_SCREEN_COPY.deleteLink, ACCOUNT_DELETE_COPY.deleteButton);
  assert.equal(ACCOUNT_SCREEN_COPY.close, PLANS_COPY.close);
});

test('the delete function\'s cancel-failed line also points at Account, Manage subscription', () => {
  // Server words (LIVE) that send people to this screen.
  assert.ok(ACCOUNT_DELETE_ERRORS.cancelFailed.includes(`${ACCOUNT_SCREEN_COPY.title}, ${PLANS_COPY.manage}`));
});
