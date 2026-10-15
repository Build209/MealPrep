import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { ForkyPinned, ForkyTipCloud } from '../forky/ForkyHeader';
import { channelLabel, parseChannel } from '../lib/channel';
import { env } from '../lib/env';
import { colors, layout, radius, space, touch } from '../theme/tokens';
import { AppText } from './AppText';

const previewLabel = channelLabel(parseChannel(env.appChannel));

/** The person icon at the right of the bar: opens Account. Ink on banana, never tomato; 44x44 tap area. */
function AccountButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/account')}
      accessibilityRole="button"
      accessibilityLabel="Account"
      testID="topbar-account"
      hitSlop={4}
      style={({ pressed }) => ({
        minWidth: touch.min,
        minHeight: touch.min,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather
        name="user"
        size={24}
        color={colors.onBanana}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

/**
 * Banana bar with the two-colour wordmark ("Plan" in tomato), on every tab. Signed in, Forky stands
 * beside the wordmark (opens Ask Forky) and his tips open under it (src/forky/ForkyHeader.tsx).
 * With `account` (the tab screens), a person icon at the right opens Account: the place the renewal
 * terms point to ("Account, Manage subscription") is one tap from every tab, not only from Home.
 */
export function TopBar({ account = false }: { account?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const { session, recovery } = useAuth();
  const forky = !!session && !recovery; // not on sign-in or while choosing a new password
  const showAccount = account && forky;
  return (
    <View style={{ backgroundColor: colors.banana, paddingTop: insets.top, alignItems: 'center' }}>
      <View
        style={{
          width: '100%',
          maxWidth: layout.maxWidth,
          paddingHorizontal: space.gutter,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.gap,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {forky ? <ForkyPinned /> : null}
          <AppText variant="sectionTitle" display color="onBanana" accessibilityRole="header" accessibilityLabel="MealPlanatic">
            Meal<AppText variant="sectionTitle" display color="tomato">Plan</AppText>atic
          </AppText>
        </View>
        {/* Shrinks before the wordmark does: on a narrow phone the preview label wraps, the icon stays 44px. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          {previewLabel ? (
            <View
              style={{
                flexShrink: 1,
                borderWidth: 1,
                borderColor: colors.onBanana,
                borderRadius: radius.pill,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <AppText variant="label" color="onBanana">
                {previewLabel}
              </AppText>
            </View>
          ) : null}
          {showAccount ? <AccountButton /> : null}
        </View>
      </View>
      {forky ? (
        <View style={{ width: '100%', maxWidth: layout.maxWidth, paddingHorizontal: space.gutter }}>
          <ForkyTipCloud />
        </View>
      ) : null}
    </View>
  );
}
