import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Field } from '../../auth/Field';
import type { PantryItemFields } from '../../data/pantryFields';
import { PANTRY_STORAGE_LOCATIONS, PANTRY_STORAGE_LOCATION_LABELS, type PantryStorageLocation } from '../../kitchen/storage';
import { colors, layout, radius, space } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { ChoicePills } from '../parts/ChoicePills';
import type { ShelvedItem } from '../types';
import {
  emptyPantryForm,
  PANTRY_FORM_COPY,
  pantryFormFromItem,
  QUICK_DATE_DAYS,
  quickDate,
  readPantryForm,
  suggestPlaceForName,
  type PantryFormErrors,
  type PantryFormValues,
} from './itemForm';

const PLACE_OPTIONS = PANTRY_STORAGE_LOCATIONS.map((id) => ({ id, label: PANTRY_STORAGE_LOCATION_LABELS[id] }));

export type PantrySheetState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; item: ShelvedItem };

type Props = {
  state: PantrySheetState;
  /** False while offline: saving and deleting are blocked and the reason is shown. */
  online: boolean;
  offlineMessage: string;
  busy: boolean;
  /** A server or check error to show inside the sheet. */
  error: string | null;
  onClose: () => void;
  onSave: (fields: PantryItemFields) => void;
  onDelete: (item: ShelvedItem) => void;
};

/** Add or edit one item, in a sheet over the page (DESIGN.md: 28px top corners, dimmed page). */
export function PantryItemSheet({ state, online, offlineMessage, busy, error, onClose, onSave, onDelete }: Props) {
  const editing = state.mode === 'edit' ? state.item : null;
  const [values, setValues] = useState<PantryFormValues>(emptyPantryForm);
  const [errors, setErrors] = useState<PantryFormErrors>({});
  // A new item's place follows the typed name until a place is picked by hand.
  const [placePicked, setPlacePicked] = useState(false);

  useEffect(() => {
    if (state.mode === 'closed') return;
    setValues(state.mode === 'edit' ? pantryFormFromItem(state.item) : emptyPantryForm());
    setErrors({});
    setPlacePicked(state.mode === 'edit');
  }, [state]);

  function change(patch: Partial<PantryFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    if (Object.keys(errors).length > 0) setErrors({});
  }

  function onChangeName(name: string) {
    change(placePicked ? { name } : { name, location: suggestPlaceForName(name) });
  }

  function onChangePlace(location: PantryStorageLocation) {
    setPlacePicked(true);
    change({ location });
  }

  function save() {
    const result = readPantryForm(values, editing ?? undefined);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSave(result.fields);
  }

  const blocked = !online || busy;
  const title = editing ? PANTRY_FORM_COPY.editTitle : PANTRY_FORM_COPY.addTitle;

  return (
    <Modal visible={state.mode !== 'closed'} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(27,31,59,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          style={{
            width: '100%',
            maxWidth: layout.maxWidth,
            alignSelf: 'center',
            maxHeight: '90%',
            backgroundColor: colors.paper,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
          }}
        >
          <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.gap }} keyboardShouldPersistTaps="handled">
            <AppText variant="sectionTitle" bold accessibilityRole="header">
              {title}
            </AppText>
            <Field label={PANTRY_FORM_COPY.name} value={values.name} onChangeText={onChangeName} autoCapitalize="sentences" />
            {errors.name ? <FieldError text={errors.name} /> : null}
            <View style={{ flexDirection: 'row', gap: space.gap }}>
              <View style={{ flex: 1 }}>
                <Field label={PANTRY_FORM_COPY.quantity} value={values.quantity} onChangeText={(quantity) => change({ quantity })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={PANTRY_FORM_COPY.unit} value={values.unit} onChangeText={(unit) => change({ unit })} autoCapitalize="none" />
              </View>
            </View>
            {errors.quantity ? <FieldError text={errors.quantity} /> : null}
            <AppText variant="secondary" bold>
              {PANTRY_FORM_COPY.place}
            </AppText>
            <ChoicePills label={PANTRY_FORM_COPY.place} options={PLACE_OPTIONS} value={values.location} onChange={onChangePlace} />
            <Field
              label={PANTRY_FORM_COPY.expiresOn}
              hint={PANTRY_FORM_COPY.expiresOnHint}
              value={values.expiresOn}
              onChangeText={(expiresOn) => change({ expiresOn })}
              autoCapitalize="none"
              placeholder="2026-10-20"
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button label={PANTRY_FORM_COPY.noDate} kind="secondary" onPress={() => change({ expiresOn: '' })} />
              {QUICK_DATE_DAYS.map((days) => (
                <Button key={days} label={PANTRY_FORM_COPY.inDays(days)} kind="secondary" onPress={() => change({ expiresOn: quickDate(days) })} />
              ))}
            </View>
            {errors.expiresOn ? <FieldError text={errors.expiresOn} /> : null}
            {!online ? <FieldError text={offlineMessage} /> : null}
            {error ? <FieldError text={error} /> : null}
            <Button label={busy ? PANTRY_FORM_COPY.saving : PANTRY_FORM_COPY.save} main disabled={blocked} onPress={save} />
            {editing ? (
              <Button label={PANTRY_FORM_COPY.remove} kind="secondary" disabled={blocked} onPress={() => onDelete(editing)} />
            ) : null}
            <Button label={PANTRY_FORM_COPY.cancel} kind="quiet" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FieldError({ text }: { text: string }) {
  return (
    <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
      {text}
    </AppText>
  );
}
