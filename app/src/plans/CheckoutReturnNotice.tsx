import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { fetchOwnProfile } from '../data/profile';
import { keys } from '../data/keys';
import { colors, layout, radius, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { CHECKOUT_RETURN_COPY } from './copy';
import { parseCheckoutReturn, PLAN_UNLOCK_POLL, stripCheckoutReturn } from './checkoutReturn';

/**
 * Web only. Handles the trip back from Stripe the way the live app does (CheckoutReturnHandler):
 * - `?checkout=cancel`: "Checkout closed. You have not been charged."
 * - `?checkout=success`: re-reads the plan until the server shows it as paid, then the unlocked line;
 *   if it is still not paid after the last try, the pending line. The server switches the plan on
 *   when Stripe confirms payment, never this page.
 * - `?billing=return` (billing portal): re-reads the plan and subscription, no message.
 * The markers are removed from the address first, so a reload does not repeat the message.
 * Mounted once in the root layout, pinned to the top so it shows over any screen.
 */
export function CheckoutReturnNotice() {
  const { ready, session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const handled = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || handled.current) return undefined;
    const outcome = parseCheckoutReturn(window.location.search);
    if (!outcome) return undefined;
    // Wait for the saved session before reading the plan; a cancel needs no account.
    if (outcome !== 'cancel' && (!ready || !userId)) return undefined;

    handled.current = true;
    const cleaned = `${window.location.pathname}${stripCheckoutReturn(window.location.search)}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', cleaned);

    if (outcome === 'cancel') {
      setMessage(CHECKOUT_RETURN_COPY.cancelled);
      return undefined;
    }
    if (outcome === 'portal') {
      void queryClient.invalidateQueries({ queryKey: keys.profile.all });
      void queryClient.invalidateQueries({ queryKey: ['billing'] });
      return undefined;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const check = async () => {
      if (stopped) return;
      attempt += 1;
      let paid = false;
      try {
        const profile = await fetchOwnProfile(userId);
        queryClient.setQueryData(keys.profile.own(userId), profile);
        paid = profile.plan === 'paid';
      } catch {
        // A failed read counts as "not yet"; the next try or the pending line covers it.
      }
      if (stopped) return;
      if (paid) {
        void queryClient.invalidateQueries({ queryKey: ['billing'] });
        setMessage(CHECKOUT_RETURN_COPY.unlocked);
        return;
      }
      if (attempt >= PLAN_UNLOCK_POLL.attempts) {
        setMessage(CHECKOUT_RETURN_COPY.pending);
        return;
      }
      timer = setTimeout(() => void check(), PLAN_UNLOCK_POLL.intervalMs);
    };
    void check();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [ready, userId, queryClient]);

  if (!message) return null;
  return (
    <View
      style={{
        pointerEvents: 'box-none',
        position: 'absolute',
        left: 0,
        right: 0,
        top: insets.top,
        padding: space.gutter,
        alignItems: 'center',
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          width: '100%',
          maxWidth: layout.maxWidth - space.gutter * 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.gap,
          paddingLeft: space.cardPadding,
          paddingRight: 8,
          paddingVertical: 8,
          borderRadius: radius.card,
          backgroundColor: colors.ink,
        }}
      >
        <AppText color="onPrimary" style={{ flex: 1 }} accessibilityRole="alert">
          {message}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => setMessage(null)}
          style={{ minHeight: touch.min, minWidth: touch.min, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}
        >
          <AppText variant="secondary" bold color="onPrimary">
            Dismiss
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
