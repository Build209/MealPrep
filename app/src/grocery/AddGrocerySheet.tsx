import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Field } from '../auth/Field';
import { CATEGORY_LABELS } from '../kitchen/categories';
import { inferGroceryCategoryFromName } from '../kitchen/categorize';
import type { ManualGroceryFields } from '../kitchen/groceryAisles';
import { colors, layout, radius, space } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import {
  ADD_FORM_COPY,
  emptyGroceryForm,
  readGroceryForm,
  type GroceryFormErrors,
  type GroceryFormValues,
} from './groceryLogic';

type Props = {
  open: boolean;
  /** False while offline: adding is blocked and the reason is shown. */
  online: boolean;
  offlineMessage: string;
  onClose: () => void;
  onSave: (fields: ManualGroceryFields) => void;
};

/** Add one item: name, quantity, unit. The aisle is guessed from the name and shown, not asked. */
export function AddGrocerySheet({ open, online, offlineMessage, onClose, onSave }: Props) {
  const [values, setValues] = useState<GroceryFormValues>(emptyGroceryForm);
  const [errors, setErrors] = useState<GroceryFormErrors>({});

  useEffect(() => {
    if (!open) return;
    setValues(emptyGroceryForm());
    setErrors({});
  }, [open]);

  function change(patch: Partial<GroceryFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    if (errors.name || errors.quantity) setErrors({});
  }

  function save() {
    const result = readGroceryForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSave(result.fields);
  }

  const aisle = values.name.trim() ? CATEGORY_LABELS[inferGroceryCategoryFromName(values.name)] : null;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
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
              {ADD_FORM_COPY.title}
            </AppText>
            <Field label={ADD_FORM_COPY.name} value={values.name} onChangeText={(name) => change({ name })} autoCapitalize="sentences" />
            {errors.name ? <FieldError text={errors.name} /> : null}
            {aisle ? (
              <AppText variant="secondary" color="muted">
                {ADD_FORM_COPY.aisle(aisle)}
              </AppText>
            ) : null}
            <View style={{ flexDirection: 'row', gap: space.gap }}>
              <View style={{ flex: 1 }}>
                <Field
                  label={ADD_FORM_COPY.quantity}
                  value={values.quantity}
                  onChangeText={(quantity) => change({ quantity })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={ADD_FORM_COPY.unit} value={values.unit} onChangeText={(unit) => change({ unit })} autoCapitalize="none" />
              </View>
            </View>
            {errors.quantity ? <FieldError text={errors.quantity} /> : null}
            {!online ? <FieldError text={offlineMessage} /> : null}
            <Button label={ADD_FORM_COPY.save} main disabled={!online} onPress={save} />
            <Button label={ADD_FORM_COPY.cancel} kind="quiet" onPress={onClose} />
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
