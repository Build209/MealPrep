import { useQueryClient } from '@tanstack/react-query';
import { router, useGlobalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { fetchOwnProfile } from '../data/profile';
import { keys } from '../data/keys';
import { logEvent } from '../lib/events';
import { colors, layout, radius, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { CHECKOUT_RETURN_COPY } from './copy';
import { parseCheckoutReturn, PLAN_UNLOCK_POLL, stripCheckoutReturn, type CheckoutReturn } from './checkoutReturn';

/** The return marker in the address the page was opened with; cleared once its message is shown. */
let startupOutcome: CheckoutReturn | null =
  Platform.OS === 'web' && typeof window !== 'undefined' ? parseCheckoutReturn(window.location.search) : null;
/** Whether the page was opened with a marker, so the router's copy of it should be cleared too. */
const openedWithMarker = startupOutcome !== null;
/** The usage log row for this return is written once, even if the effect below runs again. */
let returnLogged = false;

/**
 * Web only. Handles the trip back from Stripe the way the live app does (CheckoutReturnHandler):
 * - `?checkout=cancel`: "Checkout closed. You have not been charged."
 * - `?checkout=success`: re-reads the plan until the server shows it as paid, then the unlocked line;
 *   if it is still not paid after the last try, the pending line. The server switches the plan on
 *   when Stripe confirms payment, never this page.
 * - `?billing=return` (billing portal): re-reads the plan and subscription, no message.
 * The address is read once, when the bundle loads: Expo Router rewrites it while the app starts
 * (the tabs mount only after the saved session is read), so reading it later can miss the marker.
 * The markers are removed from the address, so a reload does not repeat the message, and from the
 * router's own params: otherwise Expo Router writes them back into the address on its next update.
 * Mounted once in the root layout, pinned to the top so it shows over any screen.
 */
export function CheckoutReturnNotice() {
  const { ready, session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const handled = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const params = useGlobalSearchParams<{ checkout?: string; billing?: string }>();
  const routerHasMarker = params.checkout !== undefined || params.billing !== undefined;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || handled.current) return undefined;
    const outcome = startupOutcome;
    if (!outcome) return undefined;
    const cleaned = `${window.location.pathname}${stripCheckoutReturn(window.location.search)}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', cleaned);
    // Wait for the saved session before reading the plan; a cancel needs no account.
    if (outcome !== 'cancel' && (!ready || !userId)) return undefined;

    handled.current = true;

    if (!returnLogged && (outcome === 'success' || outcome === 'cancel')) {
      returnLogged = true;
      // Signed-out visitors record nothing (logEvent checks the session).
      logEvent(outcome === 'success' ? 'checkout_success' : 'checkout_cancelled');
    }

    if (outcome === 'cancel') {
      startupOutcome = null;
      setMessage(CHECKOUT_RETURN_COPY.cancelled);
      return undefined;
    }
    if (outcome === 'portal') {
      startupOutcome = null;
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
        startupOutcome = null;
        void queryClient.invalidateQueries({ queryKey: ['billing'] });
        setMessage(CHECKOUT_RETURN_COPY.unlocked);
        return;
      }
      if (attempt >= PLAN_UNLOCK_POLL.attempts) {
        startupOutcome = null;
        setMessage(CHECKOUT_RETURN_COPY.pending);
        return;
      }
      timer = setTimeout(() => void check(), PLAN_UNLOCK_POLL.intervalMs);
    };
    void check();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      // Stopped before an answer (the effect re-ran or the layout remounted): poll again next run.
      handled.current = false;
    };
  }, [ready, userId, queryClient]);

  // Drop the markers from the router's params too, so it does not put them back in the address.
  useEffect(() => {
    if (Platform.OS !== 'web' || !openedWithMarker || !routerHasMarker) return;
    try {
      router.setParams({ checkout: undefined, billing: undefined });
    } catch {
      // Router not ready yet; this runs again when the params or session change.
    }
  }, [routerHasMarker, ready, userId]);

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
