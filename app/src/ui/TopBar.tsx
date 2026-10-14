import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { ForkyPinned, ForkyTipCloud } from '../forky/ForkyHeader';
import { channelLabel, parseChannel } from '../lib/channel';
import { env } from '../lib/env';
import { colors, layout, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

const previewLabel = channelLabel(parseChannel(env.appChannel));

/**
 * Banana bar with the two-colour wordmark ("Plan" in tomato), on every tab. Signed in, Forky stands
 * beside the wordmark (opens Ask Forky) and his tips open under it (src/forky/ForkyHeader.tsx).
 */
export function TopBar() {
  const insets = useSafeAreaInsets();
  const { session, recovery } = useAuth();
  const forky = !!session && !recovery; // not on sign-in or while choosing a new password
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
        {previewLabel ? (
          <View
            style={{
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
      </View>
      {forky ? (
        <View style={{ width: '100%', maxWidth: layout.maxWidth, paddingHorizontal: space.gutter }}>
          <ForkyTipCloud />
        </View>
      ) : null}
    </View>
  );
}
