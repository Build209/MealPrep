import { Pressable, TextInput, View } from 'react-native';
import { colors, fonts, radius, touch, type as typeScale } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { PLACE_LABELS, SCAN_PLACES, type ScanPlace } from './request';
import type { ReviewRow, RowEdit } from './review';

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

function ReviewItem({ row, index, problem, onEdit, onRemove }: {
  row: ReviewRow;
  index: number;
  problem?: string;
  onEdit: (change: RowEdit) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  return (
    <Card style={problem ? { borderColor: colors.danger } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <AppText variant="label" color="muted">
          {`ITEM ${n}`}
        </AppText>
        {row.needsCheck ? (
          <View style={{ backgroundColor: colors.warningLight, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
            <AppText variant="label" color="onWarning">
              Check this
            </AppText>
          </View>
        ) : null}
      </View>
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

/** Every detected item, editable or removable, before anything is saved. */
export function ReviewList(props: {
  rows: readonly ReviewRow[];
  problems: Record<string, string>;
  onEdit: (key: string, change: RowEdit) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      {props.rows.map((row, index) => (
        <ReviewItem
          key={row.key}
          row={row}
          index={index}
          problem={props.problems[row.key]}
          onEdit={(change) => props.onEdit(row.key, change)}
          onRemove={() => props.onRemove(row.key)}
        />
      ))}
    </View>
  );
}
