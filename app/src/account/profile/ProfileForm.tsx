import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Field } from '../../auth/Field';
import { ALLERGEN_KEYS, ALLERGEN_LABELS, type AllergenKey } from '../../allergens/types';
import { useAllergenPrefs } from '../../allergens/useAllergenPrefs';
import { useUpdateProfileFields } from '../../data/profileMutations';
import { useIsOnline } from '../../data/online';
import type { Profile } from '../../data/rows';
import { colors, radius, touch } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { PROFILE_COPY as COPY } from '../copy';
import { Chip } from './Chip';
import {
  DIET_OPTIONS,
  HOUSEHOLD_MAX,
  HOUSEHOLD_MIN,
  NAME_MAX,
  NOTES_MAX,
  cleanDraft,
  clampHousehold,
  hasErrors,
  isDirty,
  saveLineKind,
  toggleKey,
  validateProfile,
  type ProfileDraft,
  type SaveStatus,
} from './profileForm';

const DIET_KEYS = DIET_OPTIONS.map((d) => d.key);

function StepButton({ label, glyph, onPress, disabled, testID }: { label: string; glyph: string; onPress: () => void; disabled: boolean; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => ({
        width: touch.min,
        height: touch.min,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <AppText variant="sectionTitle" aria-hidden>
        {glyph}
      </AppText>
    </Pressable>
  );
}

/** Name, household size, dietary notes, diets and allergens, with one Save button. */
export function ProfileForm({ profile }: { profile: Profile }) {
  const prefs = useAllergenPrefs();
  const updateFields = useUpdateProfileFields();
  const online = useIsOnline();
  const [draft, setDraft] = useState<ProfileDraft>(() => ({
    name: profile.name,
    householdSize: clampHousehold(profile.householdSize),
    dietaryNotes: profile.dietaryNotes ?? '',
    diets: [],
    allergens: [],
  }));
  const [saved, setSaved] = useState<ProfileDraft>(draft);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [showErrors, setShowErrors] = useState(false);
  const seeded = useRef(false);

  // Diets and allergens arrive from user_diet_prefs; take them in once, without overwriting edits.
  useEffect(() => {
    if (prefs.isLoading || seeded.current) return;
    seeded.current = true;
    setDraft((d) => ({ ...d, diets: [...prefs.diets], allergens: [...prefs.allergens] }));
    setSaved((s) => ({ ...s, diets: [...prefs.diets], allergens: [...prefs.allergens] }));
  }, [prefs.isLoading, prefs.diets, prefs.allergens]);

  const errors = validateProfile(draft);
  const dirty = isDirty(draft, saved);
  const line = saveLineKind(status, online, dirty);

  function edit(patch: Partial<ProfileDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
    if (status === 'saved' || status === 'error') setStatus('idle');
  }

  async function save() {
    if (status === 'saving') return;
    if (!online) {
      setStatus('offline');
      return;
    }
    setShowErrors(true);
    if (hasErrors(errors)) return;
    const clean = cleanDraft(draft);
    setStatus('saving');
    try {
      await updateFields.mutateAsync({ name: clean.name, householdSize: clean.householdSize, dietaryNotes: clean.dietaryNotes });
      await prefs.save({ allergens: clean.allergens as AllergenKey[], diets: clean.diets });
      setDraft(clean);
      setSaved(clean);
      setShowErrors(false);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  const nameError = showErrors && errors.name ? (errors.name === 'empty' ? COPY.nameEmpty : COPY.nameTooLong) : null;
  const notesError = showErrors && errors.dietaryNotes ? COPY.notesTooLong : null;

  return (
    <View style={{ gap: 16 }} testID="profile-form">
      <View style={{ gap: 4 }}>
        <Field
          label={COPY.nameLabel}
          value={draft.name}
          onChangeText={(name) => edit({ name })}
          placeholder={COPY.namePlaceholder}
          maxLength={NAME_MAX + 20}
          autoCapitalize="words"
          testID="profile-name"
        />
        {nameError ? (
          <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
            {nameError}
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <AppText variant="secondary" bold>
          {COPY.householdLabel}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <StepButton
            label={COPY.householdFewer}
            glyph="−"
            onPress={() => edit({ householdSize: clampHousehold(draft.householdSize - 1) })}
            disabled={draft.householdSize <= HOUSEHOLD_MIN}
            testID="household-minus"
          />
          <AppText bold testID="household-value" accessibilityLiveRegion="polite" style={{ minWidth: 90, textAlign: 'center' }}>
            {COPY.householdValue(draft.householdSize)}
          </AppText>
          <StepButton
            label={COPY.householdMore}
            glyph="+"
            onPress={() => edit({ householdSize: clampHousehold(draft.householdSize + 1) })}
            disabled={draft.householdSize >= HOUSEHOLD_MAX}
            testID="household-plus"
          />
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <Field
          label={COPY.notesLabel}
          value={draft.dietaryNotes}
          onChangeText={(dietaryNotes) => edit({ dietaryNotes })}
          placeholder={COPY.notesPlaceholder}
          maxLength={NOTES_MAX + 40}
          multiline
          testID="profile-notes"
        />
        {notesError ? (
          <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
            {notesError}
          </AppText>
        ) : null}
      </View>

      {prefs.isLoading ? (
        <AppText variant="secondary" color="muted">
          {COPY.loadingPrefs}
        </AppText>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <AppText variant="secondary" bold>
              {COPY.dietsLabel}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityLabel={COPY.dietsLabel}>
              {DIET_OPTIONS.map((diet) => (
                <Chip
                  key={diet.key}
                  label={diet.label}
                  selected={draft.diets.includes(diet.key)}
                  onPress={() => edit({ diets: toggleKey(draft.diets, diet.key, DIET_KEYS) })}
                  testID={`diet-${diet.key}`}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <AppText variant="secondary" bold>
              {COPY.allergensLabel}
            </AppText>
            <AppText variant="secondary" color="muted" testID="allergens-help">
              {COPY.allergensHelp}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityLabel={COPY.allergensLabel}>
              {ALLERGEN_KEYS.map((key) => (
                <Chip
                  key={key}
                  label={ALLERGEN_LABELS[key]}
                  selected={draft.allergens.includes(key)}
                  onPress={() => edit({ allergens: toggleKey(draft.allergens, key, ALLERGEN_KEYS) })}
                  testID={`allergen-${key}`}
                />
              ))}
            </View>
          </View>
        </>
      )}

      <Button
        label={line === 'saving' ? COPY.saving : COPY.save}
        main
        onPress={save}
        disabled={line === 'saving' || !dirty || prefs.isLoading}
        testID="profile-save"
      />
      {line === 'saved' || line === 'offline' || line === 'error' ? (
        <AppText
          variant="secondary"
          color={line === 'saved' ? 'success' : 'danger'}
          bold
          accessibilityRole={line === 'saved' ? undefined : 'alert'}
          accessibilityLiveRegion="polite"
          testID="profile-save-status"
        >
          {line === 'saved' ? COPY.saved : line === 'offline' ? COPY.saveOffline : COPY.saveFailed}
        </AppText>
      ) : null}
    </View>
  );
}
