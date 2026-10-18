import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, radius, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { GEAR_COPY as COPY } from './copy';
import { shelves, type GearItem } from './gear';

/**
 * One shelf at a time: a grid of tap-to-pick tiles with Back / Next, and a Save on the last step.
 * Reusable shape for other step flows later (progress text, prompt, tiles, nav). The caller owns
 * saving; `onSave` gets the slugs the person picked.
 */
export function GearPicker({
  catalog,
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  catalog: readonly GearItem[];
  initial: readonly string[];
  saving: boolean;
  error: boolean;
  onSave: (picks: string[]) => void;
  onCancel: () => void;
}) {
  const steps = shelves(catalog);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial));
  const current = steps[step];
  if (!current) return null;
  const last = step === steps.length - 1;

  const toggle = (slug: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  return (
    <View testID="gear-picker" style={{ gap: 12 }}>
      <AppText variant="secondary" color="muted">
        {COPY.stepOf(step + 1, steps.length)}
      </AppText>
      <AppText variant="sectionTitle" display>
        {COPY.shelfPrompt[current.key]}
      </AppText>
      <AppText variant="secondary" color="muted">
        {COPY.tapToPick}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {current.items.map((item) => {
          const on = picked.has(item.slug);
          return (
            <Pressable
              key={item.slug}
              onPress={() => toggle(item.slug)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={COPY.tileA11y(item.name, on)}
              testID={`gear-tile-${item.slug}`}
              style={({ pressed }) => ({
                minHeight: touch.min,
                paddingHorizontal: 16,
                borderRadius: radius.control,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.primary : colors.border,
                backgroundColor: on ? colors.banana : colors.card,
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <AppText bold={on}>{item.name}</AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
          {COPY.saveFailed}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Button label={step === 0 ? COPY.cancel : COPY.back} kind="quiet" onPress={() => (step === 0 ? onCancel() : setStep(step - 1))} disabled={saving} testID="gear-back" />
        {last ? (
          <Button label={saving ? COPY.saving : COPY.save} disabled={saving} onPress={() => onSave([...picked])} testID="gear-save" />
        ) : (
          <Button label={COPY.next} onPress={() => setStep(step + 1)} testID="gear-next" />
        )}
      </View>
    </View>
  );
}
