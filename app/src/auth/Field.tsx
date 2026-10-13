import { TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, radius, touch, type as typeScale } from '../theme/tokens';
import { AppText } from '../ui/AppText';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Short help under the field, e.g. the password rule. */
  hint?: string;
};

/** A text field with its label as visible text above it (DESIGN.md: never placeholder only). */
export function Field({ label, hint, ...rest }: Props) {
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="secondary" bold>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.muted}
        style={{
          minHeight: touch.min + 4,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.control,
          backgroundColor: colors.card,
          paddingHorizontal: 14,
          paddingVertical: 10,
          color: colors.ink,
          fontFamily: fonts.body,
          fontSize: typeScale.body.fontSize,
        }}
        {...rest}
      />
      {hint ? (
        <AppText variant="secondary" color="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
