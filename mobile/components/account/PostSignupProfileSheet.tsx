import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput } from 'react-native';
import { Modal } from '../BackAwareModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACCOUNT_SHEET_COPY, HOUSEHOLD_SIZE_LIMITS } from '../../config/account';
import { useApp } from '../../context/AppContext';
import { readSavedZip } from '../../lib/smartShop/storage';
import { prefillHomeZipFromGrantedLocation } from '../../lib/profile/prefillHomeZipFromLocation';
import { PROFILE_HOME_ZIP_COPY, validateOptionalHomeZip } from '../../lib/profile/homeZip';
import { DietAllergiesSection } from '../diet/DietAllergiesSection';
import { DIET_PREF_COPY } from '../../config/diet';
import type { UserDietPrefs } from '../../lib/diet/types';
import { ProfileAvatar } from './ProfileAvatar';
import { pickProfilePhotoFromLibrary } from './pickProfilePhoto';
import { HomeZipField } from './HomeZipField';

type PostSignupProfileSheetProps = {
  visible: boolean;
  onDone: () => void;
};

function PostSignupProfileForm({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { profile, saveProfileSetup, uploadProfilePhoto, profileReady, userDietPrefs, saveUserDietPrefs } =
    useApp();
  const [dietPrefs, setDietPrefs] = useState<UserDietPrefs>(userDietPrefs);
  const [name, setName] = useState(profile.name);
  const [zip, setZip] = useState(() => formatInitialZip(profile));
  const [householdSize, setHouseholdSize] = useState(String(profile.householdSize || 2));
  const [photoPreview, setPhotoPreview] = useState<string | null>(profile.photoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [hideZipField, setHideZipField] = useState(false);
  const [zipHint, setZipHint] = useState<string | null>(null);

  useEffect(() => {
    if (profile.homeZip?.trim() || readSavedZip()) return;
    let cancelled = false;
    void prefillHomeZipFromGrantedLocation().then((prefill) => {
      if (cancelled || !prefill) return;
      setLocationCoords({ lat: prefill.lat, lng: prefill.lng });
      if (prefill.zip) {
        setZip(prefill.zip);
        setZipHint(PROFILE_HOME_ZIP_COPY.fromLocationHint);
      } else {
        setHideZipField(true);
        setZipHint(PROFILE_HOME_ZIP_COPY.usingLocationSkip);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profile.homeZip, profile.id]);

  async function onPickPhoto() {
    setError(null);
    try {
      const prepared = await pickProfilePhotoFromLibrary();
      if (!prepared) return;
      setPhotoPreview(prepared.uri);
      if (profileReady) {
        const uploaded = await uploadProfilePhoto(prepared);
        setPhotoPreview(uploaded.photoUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update photo.');
    }
  }

  async function save(andClose: boolean) {
    setBusy(true);
    setError(null);
    setZipError(null);
    try {
      const zipValidation = hideZipField && !zip.trim()
        ? { ok: true as const, zip: '' }
        : validateOptionalHomeZip(zip);
      if (!zipValidation.ok) {
        setZipError(zipValidation.message);
        return;
      }
      const size = Math.min(
        HOUSEHOLD_SIZE_LIMITS.max,
        Math.max(HOUSEHOLD_SIZE_LIMITS.min, Number.parseInt(householdSize, 10) || 2),
      );
      await saveProfileSetup({
        name: name.trim(),
        homeZip: zipValidation.zip,
        householdSize: size,
        homeLat: locationCoords?.lat,
        homeLng: locationCoords?.lng,
      });
      await saveUserDietPrefs(dietPrefs);
      if (andClose) onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-paper"
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 20,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-2xl font-bold text-ink">{ACCOUNT_SHEET_COPY.postSignupTitle}</Text>
      <Text className="mt-2 text-sm text-muted">{ACCOUNT_SHEET_COPY.postSignupSubtitle}</Text>

      <Pressable onPress={() => void onPickPhoto()} className="mt-6 items-center">
        <ProfileAvatar name={name || profile.name} photoUrl={photoPreview} size={80} />
        <Text className="mt-2 text-sm font-bold text-primary">{ACCOUNT_SHEET_COPY.changePhoto}</Text>
      </Pressable>

      <Text className="mt-6 text-sm font-semibold text-ink">{ACCOUNT_SHEET_COPY.displayNameLabel}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        accessibilityLabel={ACCOUNT_SHEET_COPY.displayNameLabel}
        className="mt-2 rounded-xl border border-border bg-card px-3 py-2 text-ink"
        autoCapitalize="words"
      />

      <Text className="mt-4 text-sm font-semibold text-ink">{ACCOUNT_SHEET_COPY.householdLabel}</Text>
      <TextInput
        value={householdSize}
        onChangeText={setHouseholdSize}
        keyboardType="number-pad"
        className="mt-2 rounded-xl border border-border bg-card px-3 py-2 text-ink"
        accessibilityLabel={ACCOUNT_SHEET_COPY.householdLabel}
      />

      {hideZipField && zipHint ? (
        <Text className="mt-4 text-xs text-muted">{zipHint}</Text>
      ) : (
        <HomeZipField
          value={zip}
          onChange={(next) => {
            setZip(next);
            setZipError(null);
            setHideZipField(false);
          }}
          hint={zipHint}
          error={zipError}
        />
      )}

      <DietAllergiesSection value={dietPrefs} onChange={setDietPrefs} compact />

      {error ? <Text className="mt-3 text-sm text-danger">{error}</Text> : null}

      <Pressable
        disabled={busy}
        onPress={() => void save(true)}
        className={`mt-8 rounded-2xl bg-primary px-4 py-4 ${busy ? 'opacity-60' : ''}`}
      >
        <Text className="text-center text-base font-bold text-on-primary">
          {ACCOUNT_SHEET_COPY.postSignupSave}
        </Text>
      </Pressable>
      <Pressable disabled={busy} onPress={onDone} className="mt-3 py-3">
        <Text className="text-center text-base font-bold text-muted">
          {ACCOUNT_SHEET_COPY.postSignupSkip} · {DIET_PREF_COPY.skipAtSignup}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function formatInitialZip(profile: { homeZip?: string }): string {
  const fromProfile = profile.homeZip?.trim() ?? '';
  if (fromProfile) return fromProfile.replace(/\D/g, '').slice(0, 5);
  const saved = readSavedZip();
  return saved ? saved.replace(/\D/g, '').slice(0, 5) : '';
}

export function PostSignupProfileSheet({ visible, onDone }: PostSignupProfileSheetProps) {
  const { profile } = useApp();
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <PostSignupProfileForm key={profile.id} onDone={onDone} />
    </Modal>
  );
}
