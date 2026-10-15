import { View } from 'react-native';
import type { RecipeStatus } from '../kitchen/recipeFeed';
import { recipeStatusLabel } from '../kitchen/recipeFeed';
import { colors, radius } from '../theme/tokens';
import { AppText } from '../ui/AppText';

/**
 * The recipe status sticker (DESIGN rules): leaf green "Ready to cook", banana "N missing".
 * Tomato is never used here (camera and money only).
 */
export function StatusSticker({ status }: { status: RecipeStatus }) {
  const ready = status.kind === 'ready';
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: ready ? colors.success : colors.banana,
      }}
    >
      <AppText variant="label" color={ready ? 'onSuccess' : 'onBanana'}>
        {recipeStatusLabel(status)}
      </AppText>
    </View>
  );
}
