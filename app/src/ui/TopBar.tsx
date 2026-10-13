import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, space } from '../theme/tokens';
import { AppText } from './AppText';

/** Banana bar with the two-colour wordmark ("Plan" in tomato), on every tab. */
export function TopBar() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.banana, paddingTop: insets.top, alignItems: 'center' }}>
      <View
        style={{
          width: '100%',
          maxWidth: layout.maxWidth,
          paddingHorizontal: space.gutter,
          paddingVertical: 12,
        }}
      >
        <AppText variant="sectionTitle" display color="onBanana" accessibilityRole="header" accessibilityLabel="MealPlanatic">
          Meal<AppText variant="sectionTitle" display color="tomato">Plan</AppText>atic
        </AppText>
      </View>
    </View>
  );
}
