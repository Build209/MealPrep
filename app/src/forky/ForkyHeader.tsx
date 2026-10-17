import { useRouter } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { Image, Pressable, View } from 'react-native';
import { usePantryItems } from '../data/pantry';
import { colors, radius, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { FORKY_FULL } from './art';
import {
  autoTipsAllowedHere,
  chooseHeaderTip,
  HEADER_TIP_COPY,
  readTipMemory,
  rememberShown,
  TIP_AUTO_FOLD_MS,
  TIP_AUTO_SHOW_DELAY_MS,
  writeTipMemory,
  type HeaderTip,
} from './headerTips';
import { logEvent } from '../lib/events';
import { deviceTipStore, readForkyBackoff, readForkyTipFrequency, recordForkyTipOutcome, recordForkyTipShown } from './tipBackoff';

/**
 * Forky pinned in the top bar (old app: lib/forkinator/pinnedDock.ts): a small Forky beside the
 * wordmark that opens Ask Forky, and short tips in a cloud under the bar (headerTips.ts rules,
 * tipBackoff.ts memory). The cloud sits inside the bar, so it never covers the page title.
 */

type TipState = { tip: HeaderTip | null; open: boolean; sessionTipShown: boolean };

let tipState: TipState = { tip: null, open: false, sessionTipShown: false };
const listeners = new Set<() => void>();
function setTipState(next: Partial<TipState>) {
  tipState = { ...tipState, ...next };
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getTipState = () => tipState;

function useTipState(): TipState {
  return useSyncExternalStore(subscribe, getTipState, getTipState);
}

/** Opens at most one tip per app session, once the pantry has loaded. */
function useTipScheduler() {
  const pantry = usePantryItems();
  const loaded = pantry.data !== undefined;
  useEffect(() => {
    if (!loaded || tipState.sessionTipShown) return;
    const store = deviceTipStore();
    if (!autoTipsAllowedHere(store)) return;
    const timer = setTimeout(() => {
      if (tipState.sessionTipShown) return;
      const now = new Date();
      const memory = readTipMemory(store);
      const tip = chooseHeaderTip({
        memory,
        backoff: readForkyBackoff(store),
        frequency: readForkyTipFrequency(store),
        pantry: pantry.data ?? null,
        now,
      });
      if (!tip) return;
      writeTipMemory(store, rememberShown(memory, tip, now));
      // Counts toward "less often", and notes whether the last one was left untouched.
      recordForkyTipShown(tip.kind, now, store);
      logEvent('forky_prompt_shown', { kind: tip.kind });
      setTipState({ tip, open: true, sessionTipShown: true });
    }, TIP_AUTO_SHOW_DELAY_MS);
    return () => clearTimeout(timer);
    // pantry.data is read when the timer fires; the tip is decided once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const { tip, open } = useTipState();
  useEffect(() => {
    if (!tip || !open) return;
    // Folds away by itself; the think dots stay as a "tap me" hint.
    const timer = setTimeout(() => setTipState({ open: false }), TIP_AUTO_FOLD_MS);
    return () => clearTimeout(timer);
  }, [tip, open]);
}

/** Small Forky in the bar. Tap: reopen a folded tip, otherwise open Ask Forky. */
export function ForkyPinned() {
  const router = useRouter();
  useTipScheduler();
  const { tip, open } = useTipState();
  const folded = tip !== null && !open;
  return (
    <Pressable
      onPress={() => (folded ? setTipState({ open: true }) : router.push('/forky'))}
      accessibilityRole="button"
      accessibilityLabel={folded ? HEADER_TIP_COPY.reopen : HEADER_TIP_COPY.openChat}
      hitSlop={4}
      style={{ minWidth: touch.min, minHeight: touch.min, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <Image source={FORKY_FULL} resizeMode="contain" accessible={false} style={{ width: 17, height: 46 }} />
      {folded ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginLeft: 2, marginBottom: 4 }}>
          <View style={{ width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.ink }} />
          <View style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.ink }} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** The open tip, under the bar's row. Nothing when no tip is open. */
export function ForkyTipCloud() {
  const router = useRouter();
  const { tip, open } = useTipState();
  if (!tip || !open) return null;

  const close = () => {
    recordForkyTipOutcome(tip.kind, 'dismissed');
    setTipState({ tip: null, open: false });
  };
  const act = (href: string) => {
    recordForkyTipOutcome(tip.kind, 'tapped');
    setTipState({ tip: null, open: false });
    router.push(href);
  };

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: colors.card,
        borderColor: colors.ink,
        borderWidth: 1,
        borderRadius: radius.card,
        paddingLeft: space.cardPadding,
        paddingRight: 4,
        paddingVertical: 8,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View style={{ flex: 1, gap: 8 }}>
        <AppText variant="secondary">{tip.message}</AppText>
        {tip.kind !== 'greeting' ? (
          <Button label={tip.action.label} kind="secondary" onPress={() => act(tip.action.href)} style={{ alignSelf: 'flex-start' }} />
        ) : null}
      </View>
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={HEADER_TIP_COPY.close}
        style={{ width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' }}
      >
        <AppText variant="sectionTitle" color="muted" accessible={false}>
          ×
        </AppText>
      </Pressable>
    </View>
  );
}
