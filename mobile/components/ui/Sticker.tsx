import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { THEME } from '../../config/appConfig';

export type StickerTone = 'leaf' | 'ink' | 'banana' | 'tomato';

const TONES: Record<StickerTone, { background: string; text: string }> = {
  /** You have it / ready to cook. */
  leaf: { background: THEME.success, text: THEME.onSuccess },
  /** Counts and free allowances ("x2", "3 free scans"). */
  ink: { background: THEME.ink, text: THEME.banana },
  /** Partial matches and things to check ("7 of 8"). */
  banana: { background: THEME.banana, text: THEME.onBanana },
  /** Plus only. */
  tomato: { background: THEME.tomato, text: THEME.onTomato },
};

const SIZES = {
  sm: { fontSize: 13, lineHeight: 15, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 3 },
  md: { fontSize: 17, lineHeight: 19, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 4 },
} as const;

type Props = {
  label: string;
  tone?: StickerTone;
  size?: keyof typeof SIZES;
  /** Degrees. Stickers sit slightly crooked, like one pressed on by hand. */
  tilt?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * The sticker aisle look's one signature: a status shown as a die-cut sticker (white edge, soft
 * shadow, a few degrees off level). Use it for the state of a thing ("Ready to cook", "7 of 8",
 * "x2", "3 free scans"), never as decoration and never for an action.
 */
export function Sticker({ label, tone = 'banana', size = 'md', tilt = -4, style }: Props) {
  const colors = TONES[tone];
  const metrics = SIZES[size];
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: colors.background,
          borderColor: THEME.card,
          borderWidth: metrics.borderWidth,
          borderRadius: 999,
          paddingHorizontal: metrics.paddingHorizontal,
          paddingVertical: metrics.paddingVertical,
          transform: [{ rotate: `${tilt}deg` }],
          boxShadow: '0px 2px 0px rgba(27,31,59,0.14), 0px 6px 12px rgba(27,31,59,0.18)',
        },
        style,
      ]}
    >
      <Text
        className="font-display"
        style={{ color: colors.text, fontSize: metrics.fontSize, lineHeight: metrics.lineHeight }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
