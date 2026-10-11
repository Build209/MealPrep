import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal } from '../BackAwareModal';
import { AUTH_MIN_PASSWORD_LENGTH, AUTH_RESET_COPY, AUTH_RESULT_COPY } from '../../config/authConfig';
import { useApp } from '../../context/AppContext';

type PasswordResetSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Shown after a password reset link is opened: the link has already signed the person in,
 * and this is where they choose the new password. "Not now" leaves the old password in place.
 */
export function PasswordResetSheet({ visible, onClose }: PasswordResetSheetProps) {
  const insets = useSafeAreaInsets();
  const { updatePassword } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!visible) return null;

  async function save() {
    if (busy) return;
    if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
      setError(AUTH_RESULT_COPY.weakPassword);
      return;
    }
    if (password !== confirm) {
      setError(AUTH_RESET_COPY.mismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await updatePassword(password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPassword('');
      setConfirm('');
    } catch {
      setError(AUTH_RESULT_COPY.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="rounded-t-3xl bg-paper px-4 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
          <Text className="text-lg font-bold text-ink" accessibilityRole="header">
            {AUTH_RESET_COPY.newPasswordTitle}
          </Text>
          <Text className="mt-1 text-sm leading-5 text-muted">{AUTH_RESET_COPY.newPasswordBlurb}</Text>
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            className="mt-4 rounded-xl border border-border bg-card px-3 py-3 text-ink"
            placeholder={`${AUTH_RESET_COPY.newPasswordLabel} (min ${AUTH_MIN_PASSWORD_LENGTH} chars)`}
            accessibilityLabel={AUTH_RESET_COPY.newPasswordLabel}
          />
          <TextInput
            value={confirm}
            onChangeText={(text) => {
              setConfirm(text);
              if (error) setError(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            onSubmitEditing={() => void save()}
            className="mt-3 rounded-xl border border-border bg-card px-3 py-3 text-ink"
            placeholder={AUTH_RESET_COPY.confirmPasswordLabel}
            accessibilityLabel={AUTH_RESET_COPY.confirmPasswordLabel}
          />
          {error ? (
            <Text className="mt-3 text-sm font-semibold text-danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Pressable
            disabled={busy}
            onPress={() => void save()}
            accessibilityRole="button"
            accessibilityState={{ busy }}
            className={`mt-4 min-h-[48px] items-center justify-center rounded-full bg-primary px-4 ${busy ? 'opacity-60' : ''}`}
          >
            <Text className="text-center font-bold text-on-primary">{AUTH_RESET_COPY.saveButton}</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            className="mt-1 min-h-[44px] items-center justify-center"
          >
            <Text className="text-center text-sm font-semibold text-muted">{AUTH_RESET_COPY.notNow}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
