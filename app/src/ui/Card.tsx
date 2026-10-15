import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../theme/tokens';

/** White card on the paper ground: 1px border, no shadow (DESIGN.md: flat). */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.card,
          padding: space.cardPadding,
          gap: 8,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
