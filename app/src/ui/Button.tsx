import { Pressable, type PressableProps, type ViewStyle } from 'react-native';
import { colors, radius, touch } from '../theme/tokens';
import { AppText } from './AppText';

type Kind = 'primary' | 'purchase' | 'secondary' | 'quiet';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  kind?: Kind;
  /** The one main action of a screen gets the taller 54px button. */
  main?: boolean;
  style?: ViewStyle;
};

const look: Record<Kind, { bg: string; fg: 'onPrimary' | 'onTomato' | 'ink' | 'muted'; border?: string }> = {
  primary: { bg: colors.primary, fg: 'onPrimary' },
  // Tomato means camera or money: only for scans and purchases.
  purchase: { bg: colors.tomato, fg: 'onTomato' },
  secondary: { bg: colors.card, fg: 'ink', border: colors.border },
  quiet: { bg: 'transparent', fg: 'muted' },
};

export function Button({ label, kind = 'primary', main, disabled, style, ...rest }: Props) {
  const l = look[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: main ? touch.main : touch.min,
          paddingHorizontal: 20,
          borderRadius: radius.pill,
          backgroundColor: l.bg,
          borderWidth: l.border ? 1 : 0,
          borderColor: l.border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...rest}
    >
      <AppText variant="button" color={l.fg}>
        {label}
      </AppText>
    </Pressable>
  );
}
