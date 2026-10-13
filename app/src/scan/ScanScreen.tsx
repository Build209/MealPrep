import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { useScanAllowance } from '../data/scanUsage';
import { colors, radius, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { allowanceNote } from './allowance';
import { ReviewList } from './ReviewList';
import { saveButtonLabel } from './review';
import { ScanPill } from './ScanButton';
import { useScanFlow, type ScanTarget } from './useScanFlow';

const TARGETS: { id: string; label: string; target: ScanTarget }[] = [
  { id: 'pantry', label: 'Pantry shelf', target: { kind: 'shelf', place: 'pantry' } },
  { id: 'fridge', label: 'Fridge', target: { kind: 'shelf', place: 'fridge' } },
  { id: 'spice_rack', label: 'Spice rack', target: { kind: 'shelf', place: 'spice_rack' } },
  { id: 'receipt', label: 'Receipt', target: { kind: 'receipt', place: 'pantry' } },
];

function TargetChoice({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="What are you scanning?" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {TARGETS.map((t) => {
        const selected = t.id === value;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="radio"
            accessibilityLabel={t.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(t.id)}
            style={{
              minHeight: touch.min,
              paddingHorizontal: 16,
              borderRadius: radius.pill,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? colors.ink : colors.border,
              backgroundColor: selected ? colors.sand : colors.card,
              justifyContent: 'center',
            }}
          >
            <AppText variant="secondary" bold={selected}>
              {t.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function Message({ text, tone }: { text: string; tone: 'error' | 'note' }) {
  return (
    <AppText
      variant="secondary"
      color={tone === 'error' ? 'danger' : 'muted'}
      bold={tone === 'error'}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
    >
      {text}
    </AppText>
  );
}

/** Shelf, fridge, spice rack or receipt photo -> review list -> pantry. */
export function ScanScreen() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const allowance = useScanAllowance();
  const flow = useScanFlow();
  const [targetId, setTargetId] = useState('pantry');
  const target = (TARGETS.find((t) => t.id === targetId) ?? TARGETS[0]!).target;

  if (ready && !session) return <Redirect href="/sign-in" />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const note = allowanceNote(allowance);
  const { phase } = flow;
  const pickers = (
    <View style={{ gap: 10 }}>
      <ScanPill label="Take a photo" main onPress={() => void flow.start('camera', target)} />
      <ScanPill label="Choose a photo" onPress={() => void flow.start('library', target)} />
    </View>
  );

  return (
    <Screen title="Scan">
      <Button label="Close" kind="quiet" onPress={close} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />

      {phase.name === 'choose' ? (
        <Card>
          <AppText variant="sectionTitle" bold>
            What are you scanning?
          </AppText>
          <TargetChoice value={targetId} onChange={setTargetId} />
          <AppText variant="secondary" color="muted">
            {target.kind === 'receipt'
              ? 'Lay the receipt flat in good light. The photo is read, then not kept.'
              : 'One shelf at a time works best: hold close, good light, labels facing you.'}
          </AppText>
          {pickers}
          {note ? <Message text={note} tone="note" /> : null}
          {Platform.OS === 'web' ? (
            <AppText variant="label" color="muted">
              On a computer both buttons open your files.
            </AppText>
          ) : null}
        </Card>
      ) : null}

      {phase.name === 'scanning' ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={colors.ink} />
            <AppText bold accessibilityRole="alert">
              Reading your photo...
            </AppText>
          </View>
          <AppText variant="secondary" color="muted">
            This can take up to a minute for a busy shelf.
          </AppText>
        </Card>
      ) : null}

      {flow.error ? <Message text={flow.error} tone="error" /> : null}
      {flow.emptyResult ? (
        <Message text="No food spotted in that photo. Try a closer shot with labels facing the camera." tone="note" />
      ) : null}
      {flow.warnings.length > 0 && phase.name !== 'saved' ? <Message text={flow.warnings.join(' ')} tone="note" /> : null}

      {phase.name === 'review' ? (
        <>
          <AppText variant="sectionTitle" bold>
            {`Check what we found (${flow.rows.length})`}
          </AppText>
          <AppText variant="secondary" color="muted">
            Fix anything wrong and remove what you don't want. Nothing is saved until you tap Save.
          </AppText>
          <ReviewList rows={flow.rows} problems={flow.problems} onEdit={flow.edit} onRemove={flow.remove} />
          <Button
            label={flow.saving ? 'Saving...' : saveButtonLabel(flow.rows.length)}
            main
            disabled={flow.saving || flow.rows.length === 0}
            onPress={flow.saveAll}
          />
          <Card>
            <AppText variant="secondary" color="muted">
              Add another photo to this list:
            </AppText>
            <TargetChoice value={targetId} onChange={setTargetId} />
            <ScanPill label="Choose a photo" onPress={() => void flow.start('library', target)} />
          </Card>
          <Button label="Discard this scan" kind="quiet" onPress={flow.reset} />
        </>
      ) : null}

      {phase.name === 'saved' ? (
        <Card>
          <AppText variant="sectionTitle" bold accessibilityRole="alert">
            {phase.count === 1 ? 'Saved 1 item to your pantry.' : `Saved ${phase.count} items to your pantry.`}
          </AppText>
          <Button label="Scan another photo" kind="secondary" onPress={flow.reset} />
          <Button label="Done" onPress={close} />
        </Card>
      ) : null}
    </Screen>
  );
}
