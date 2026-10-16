import { Pressable } from 'react-native';
import { colors, radius, touch } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';

/** A pill that toggles on and off. Selected is ink (the app's "selected" colour); 44px tall. */
export function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: touch.min,
        minWidth: touch.min,
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.ink : colors.border,
        backgroundColor: selected ? colors.ink : colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <AppText variant="secondary" bold color={selected ? 'onPrimary' : 'ink'}>
        {label}
      </AppText>
    </Pressable>
  );
}
