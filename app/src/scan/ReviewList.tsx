import { Pressable, TextInput, View } from 'react-native';
import { colors, fonts, radius, touch, type as typeScale } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { PLACE_LABELS, SCAN_PLACES, type ScanPlace } from './request';
import type { PantryMatchRow } from '../kitchen/pantryMatch';
import { formatQuantity, isIncluded, pantryStatusFor, parseQuantity, type ReviewRow, type RowEdit, type RowPantryStatus } from './review';

/** What a row does to the pantry, in words (null for a plain new item). */
export function statusLine(row: ReviewRow, status: RowPantryStatus): string | null {
  const have = (s: { quantity: number; unit: string }) => `${formatQuantity(s.quantity)} ${s.unit}`;
  switch (status.kind) {
    case 'new':
      return null;
    case 'already':
      return `You have ${have(status)} of ${status.name}. Tick to add it again anyway.`;
    case 'top-up': {
      const added = parseQuantity(row.quantityText);
      return added === null
        ? `Adds to the ${have(status)} of ${status.name} you have.`
        : `Adds to the ${have(status)} of ${status.name} you have, making ${formatQuantity(status.quantity + added)} ${status.unit}.`;
    }
    case 'other-unit':
      return `You have ${status.name} in ${status.unit}. This is saved as its own item.`;
  }
}

function Badge({ text, tone }: { text: string; tone: 'have' | 'check' }) {
  return (
    <View style={{ backgroundColor: tone === 'have' ? colors.successLight : colors.warningLight, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <AppText variant="label" color={tone === 'have' ? 'ink' : 'onWarning'}>
        {text}
      </AppText>
    </View>
  );
}

/** The keep tick: a real checkbox, 44px tall. */
function KeepBox({ checked, item, onChange }: { checked: boolean; item: number; onChange: (value: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`Add item ${item} to pantry`}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: colors.ink,
          backgroundColor: checked ? colors.ink : colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? (
          <AppText variant="label" color="onPrimary" bold>
            ✓
          </AppText>
        ) : null}
      </View>
      <AppText variant="secondary" bold>
        Add to pantry
      </AppText>
    </Pressable>
  );
}

const inputStyle = {
  minHeight: touch.min,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.control,
  backgroundColor: colors.card,
  paddingHorizontal: 12,
  paddingVertical: 8,
  color: colors.ink,
  fontFamily: fonts.body,
  fontSize: typeScale.body.fontSize,
} as const;

function LabeledInput(props: { label: string; value: string; onChangeText: (v: string) => void; numeric?: boolean; flex?: number }) {
  return (
    <View style={{ flex: props.flex ?? 1, gap: 4 }}>
      <AppText variant="label" color="muted">
        {props.label.split(',')[0]}
      </AppText>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.numeric ? 'decimal-pad' : 'default'}
        autoCorrect={false}
        style={inputStyle}
      />
    </View>
  );
}

/** Selected chip: ink outline and ink text (DESIGN.md: ink marks anything selected). */
function PlaceChip({ place, selected, onPress, item }: { place: ScanPlace; selected: boolean; onPress: () => void; item: number }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${PLACE_LABELS[place]}, item ${item}`}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        minHeight: touch.min,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.ink : colors.border,
        backgroundColor: selected ? colors.sand : colors.card,
        justifyContent: 'center',
      }}
    >
      <AppText variant="secondary" bold={selected}>
        {PLACE_LABELS[place]}
      </AppText>
    </Pressable>
  );
}

function ReviewItem({ row, index, status, problem, onEdit, onRemove, onInclude }: {
  row: ReviewRow;
  index: number;
  status: RowPantryStatus;
  problem?: string;
  onEdit: (change: RowEdit) => void;
  onRemove: () => void;
  onInclude: (value: boolean) => void;
}) {
  const n = index + 1;
  const included = isIncluded(row, status);
  const line = statusLine(row, status);
  return (
    <Card style={problem ? { borderColor: colors.danger } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <AppText variant="label" color="muted">
          {`ITEM ${n}`}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {status.kind === 'already' ? <Badge text="Already in your pantry" tone="have" /> : null}
          {status.kind === 'top-up' ? <Badge text="Adds to what you have" tone="have" /> : null}
          {row.needsCheck ? <Badge text="Check this" tone="check" /> : null}
        </View>
      </View>
      {line ? (
        <AppText variant="secondary" color="muted">
          {line}
        </AppText>
      ) : null}
      <KeepBox checked={included} item={n} onChange={onInclude} />
      <LabeledInput label={`Name, item ${n}`} value={row.name} onChangeText={(name) => onEdit({ name })} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <LabeledInput label={`Quantity, item ${n}`} value={row.quantityText} onChangeText={(quantityText) => onEdit({ quantityText })} numeric />
        <LabeledInput label={`Unit, item ${n}`} value={row.unit} onChangeText={(unit) => onEdit({ unit })} flex={1.4} />
      </View>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SCAN_PLACES.map((place) => (
          <PlaceChip key={place} place={place} item={n} selected={row.place === place} onPress={() => onEdit({ place })} />
        ))}
      </View>
      {problem ? (
        <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
          {problem}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove item ${n}`}
        onPress={onRemove}
        style={{ minHeight: touch.min, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 4 }}
      >
        <AppText variant="secondary" color="muted" bold>
          Remove
        </AppText>
      </Pressable>
    </Card>
  );
}

/** Every detected item, editable, tickable or removable, before anything is saved. */
export function ReviewList(props: {
  rows: readonly ReviewRow[];
  /** The pantry query's rows (server data), to show what is already there. */
  pantry: readonly PantryMatchRow[];
  problems: Record<string, string>;
  onEdit: (key: string, change: RowEdit) => void;
  onRemove: (key: string) => void;
  onInclude: (key: string, value: boolean) => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      {props.rows.map((row, index) => (
        <ReviewItem
          key={row.key}
          row={row}
          index={index}
          status={pantryStatusFor(row, props.pantry)}
          problem={props.problems[row.key]}
          onEdit={(change) => props.onEdit(row.key, change)}
          onRemove={() => props.onRemove(row.key)}
          onInclude={(value) => props.onInclude(row.key, value)}
        />
      ))}
    </View>
  );
}
