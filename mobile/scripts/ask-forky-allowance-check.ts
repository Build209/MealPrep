/**
 * Ask Forky says how many questions are left when the chat opens (redesign live pass, 2026-10-11:
 * the chat looked ready at 0 left and only refused after a question was sent).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { askForkyQuestionsLeft, askForkyTier } from '../lib/forky/askForkyAllowance';
import { forkyAllowance } from '../../supabase/functions/_shared/askForkyText';

const now = new Date('2026-10-11T12:00:00Z');

// The app picks the same plan as the server, admin accounts included.
for (const [plan, planTier, role] of [
  ['free', null, 'member'],
  [null, undefined, 'member'],
  ['paid', 'plus', 'member'],
  ['paid', 'pro', 'member'],
  ['paid', 'family', 'member'],
  ['paid', null, 'member'],
  ['free', 'family', 'member'],
  ['free', null, 'admin'],
] as const) {
  const server = forkyAllowance(plan, planTier, now, role === 'admin');
  const tier = askForkyTier(plan, planTier, role);
  assert.equal(tier, server.tier, `tier for ${plan}/${planTier}/${role}`);
  assert.equal(askForkyQuestionsLeft(tier, 0), server.limit, `full allowance for ${plan}/${planTier}/${role}`);
}

// Counting down, never below zero, and silent when the count is unknown.
assert.equal(askForkyQuestionsLeft('free', 2), 3);
assert.equal(askForkyQuestionsLeft('free', 5), 0);
assert.equal(askForkyQuestionsLeft('free', 9), 0);
assert.equal(askForkyQuestionsLeft('plus', 14), 1);
assert.equal(askForkyQuestionsLeft('free', null), null);
assert.equal(askForkyQuestionsLeft('free', Number.NaN), null);

// The chat reads the account's own count when it opens and blocks sending at zero.
const root = join(__dirname, '..');
const sheet = readFileSync(join(root, 'components/forkinator/AskForkySheet.tsx'), 'utf8');
assert.match(sheet, /useAskForkyUsed\(/);
assert.match(sheet, /setLimitReached\(left === 0 \?/);
const hook = readFileSync(join(root, 'hooks/useAskForkyUsed.ts'), 'utf8');
assert.match(hook, /from\('forky_chat_usage'\)/);
assert.match(hook, /\.eq\('user_id', userId\)/);
assert.match(hook, /\.eq\('period', usageMonth\(\)\)/);

console.log('ask-forky-allowance-check: ok');
