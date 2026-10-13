import { useRouter } from 'expo-router';
import { Pressable, View, type ViewStyle } from 'react-native';
import { useScanAllowance } from '../data/scanUsage';
import { colors, radius, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { allowanceText } from './allowance';

/** A small drawn camera (no icon font in the app yet): body, viewfinder bump and lens, in tomato. */
export function CameraIcon({ size = 20, color = colors.tomato }: { size?: number; color?: string }) {
  const body = Math.round(size * 0.7);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }} accessibilityElementsHidden importantForAccessibility="no">
      <View style={{ width: size * 0.36, height: size * 0.16, backgroundColor: color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
      <View
        style={{
          width: size,
          height: body,
          borderRadius: size * 0.18,
          borderWidth: 2,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: body * 0.5, height: body * 0.5, borderRadius: radius.pill, borderWidth: 2, borderColor: color }} />
      </View>
    </View>
  );
}

type ScanPillProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  main?: boolean;
  style?: ViewStyle;
};

/** DESIGN.md "Scan": white pill, tomato outline, camera icon. Never a filled tomato button. */
export function ScanPill({ label, onPress, disabled, main, style }: ScanPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: main ? touch.main : touch.min,
          paddingHorizontal: 20,
          borderRadius: radius.pill,
          backgroundColor: colors.card,
          borderWidth: 2,
          borderColor: colors.tomato,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <CameraIcon />
      <AppText variant="button" color="ink">
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * The Scan button with this month's allowance on it ("Scan · 2 left this month"). Opens the scan
 * screen unless `onPress` is given. Meant for the Pantry tab; Home carries it until then.
 */
export function ScanButton({ label = 'Scan', onPress, main, style }: { label?: string; onPress?: () => void; main?: boolean; style?: ViewStyle }) {
  const router = useRouter();
  const allowance = useScanAllowance();
  return <ScanPill label={allowanceText(allowance, label)} main={main} style={style} onPress={onPress ?? (() => router.push('/scan'))} />;
}
