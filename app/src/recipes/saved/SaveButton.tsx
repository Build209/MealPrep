import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useSaveToggle, type SaveTarget } from '../../data/savedRecipes';
import { colors, radius, touch } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';

type Props = {
  /** What to save: saveTargetForRecipe(recipe) or saveTargetForCreatorVideo(video) from src/data/savedRecipes. */
  target: SaveTarget;
  style?: ViewStyle;
  /** Show the plain error under the heart when a save fails (default true). */
  showError?: boolean;
};

/**
 * Heart that saves or unsaves one recipe or creator video (user_saved_recipes). 44px round tap
 * target. The change shows at once and rolls back if the server refuses (src/data/savedRecipes.ts).
 * Ink, not tomato or red: those colours mean money and problems (DESIGN.md).
 *
 * Screen readers hear "Save <title>" or "Remove <title> from saved".
 */
export function SaveButton({ target, style, showError = true }: Props) {
  const s = useSaveToggle(target);
  const label = s.saved ? `Remove ${target.title} from saved` : `Save ${target.title}`;
  const disabled = !s.ready || s.busy;
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy: s.busy }}
        disabled={disabled}
        onPress={s.toggle}
        hitSlop={4}
        style={({ pressed }) => ({
          width: touch.min,
          height: touch.min,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: s.saved ? colors.ink : colors.border,
          backgroundColor: s.saved ? colors.sand : colors.card,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : !s.ready ? 0.5 : 1,
        })}
      >
        {!s.ready ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ fontSize: 22, lineHeight: 24, color: colors.ink, includeFontPadding: false }}
          >
            {s.saved ? '♥' : '♡'}
          </Text>
        )}
      </Pressable>
      {showError && s.error ? (
        <AppText variant="label" color="danger" accessibilityRole="alert" style={{ maxWidth: 140, textAlign: 'center' }}>
          {s.error}
        </AppText>
      ) : null}
    </View>
  );
}
