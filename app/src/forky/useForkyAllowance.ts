import { useSyncExternalStore } from 'react';
import { useForkyMessagesUsed } from '../data/forkyChat';
import { useProfile } from '../data/profile';
import { currentUsagePeriod } from '../scan/allowance';
import { forkyAllowanceFor, forkyTierFor, forkyUsedUp } from './allowance';
import { forkyChat, usageForPeriod } from './chatStore';

/**
 * The session's Ask Forky chat and this month's allowance, shared by the chat screen (/forky) and
 * the question box on Home, so both always show the same "N questions left this month".
 * The rules are in allowance.ts; the server stays the judge.
 */
export function useForkyAllowance(userId: string | null) {
  const chat = useSyncExternalStore(forkyChat.subscribe, () => forkyChat.snapshot(userId), () => forkyChat.snapshot(userId));
  const profile = useProfile();
  const used = useForkyMessagesUsed();
  const period = currentUsagePeriod();
  const tier = profile.data ? forkyTierFor(profile.data) : null;
  const allowance = forkyAllowanceFor(tier, used.data ?? null, usageForPeriod(chat.serverUsage, period));
  return { chat, profile, period, tier, allowance, usedUp: forkyUsedUp(allowance) };
}
