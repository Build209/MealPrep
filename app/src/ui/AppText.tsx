import type { ReactNode } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts, type as typeScale, type ColorName, type TypeName } from '../theme/tokens';

type Props = TextProps & {
  /** One of the six DESIGN.md sizes. */
  variant?: TypeName;
  color?: ColorName;
  /** Display face (Bagel Fat One) for titles and big numbers. */
  display?: boolean;
  bold?: boolean;
  children?: ReactNode;
};

const headingVariants: TypeName[] = ['pageTitle', 'sectionTitle'];

export function AppText({ variant = 'body', color = 'ink', display, bold, style, ...rest }: Props) {
  const base: TextStyle = {
    ...typeScale[variant],
    color: colors[color],
    fontFamily: display ? fonts.display : fonts.body,
    fontWeight: display ? '400' : bold || variant === 'button' || variant === 'label' ? '700' : '400',
  };
  const role = headingVariants.includes(variant) ? 'header' : undefined;
  return <Text accessibilityRole={role} style={[base, style]} {...rest} />;
}
