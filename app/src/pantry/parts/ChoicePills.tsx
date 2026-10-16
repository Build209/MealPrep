import { Pressable, View } from 'react-native';
import { colors, radius, touch } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';

type Option<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  /** Read out for the whole group, e.g. "Pantry view" or "Kept in". */
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

/**
 * A row of 44px pills where exactly one is chosen (DESIGN.md chips: selected is filled ink,
 * the rest white with a border). Screen readers hear a radio group.
 */
export function ChoicePills<T extends string>({ label, options, value, onChange, disabled }: Props<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected, disabled: !!disabled }}
            // The web build does not turn accessibilityState.checked into aria-checked (as in PlanChoice).
            aria-checked={selected}
            disabled={disabled}
            onPress={() => onChange(option.id)}
            style={({ pressed }) => ({
              minHeight: touch.min,
              minWidth: touch.min,
              paddingHorizontal: 16,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primary : colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <AppText variant="secondary" bold color={selected ? 'onPrimary' : 'ink'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
