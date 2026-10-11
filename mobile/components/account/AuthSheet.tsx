import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from '../BrandLogo';
import { APP_BRAND } from '../../config/appBrand';
import {
  AUTH_MAGIC_LINK_COPY,
  AUTH_MIN_PASSWORD_LENGTH,
  AUTH_RESET_COPY,
  AUTH_RESULT_COPY,
  AUTH_SIGN_UP_NOTE,
  getAuthCardBlurb,
  isMagicLinkSignInEnabled,
  type AuthActionResult,
} from '../../config/authConfig';
import { ACCOUNT_SHEET_COPY } from '../../config/account';
import { useApp } from '../../context/AppContext';

type AuthSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function AuthSheet({ visible, onClose }: AuthSheetProps) {
  const insets = useSafeAreaInsets();
  const { signInWithPassword, signUpWithPassword, signInWithMagicLink, requestPasswordReset } = useApp();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  /** Sign-in tab only: the "Forgot password?" form is showing instead of the password field. */
  const [resetting, setResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  /** This sheet's own error. (It used to show the app-wide error, which could be about anything.) */
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * The sheet closes only when the person is actually signed in. A wrong password, an address
   * that already has an account, or "confirm by email first" keeps it open with the reason:
   * it used to close in every case, so a failed sign-in looked like nothing had happened.
   */
  async function run(action: () => Promise<AuthActionResult>) {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.notice) {
        setStatus(result.notice);
        return;
      }
      setPassword('');
      onClose();
    } catch {
      setError(AUTH_RESULT_COPY.generic);
    } finally {
      setBusy(false);
    }
  }

  function submitReset() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setStatus(null);
      setError(AUTH_RESET_COPY.missingEmail);
      return;
    }
    void run(() => requestPasswordReset(trimmedEmail));
  }

  function submitPassword() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setStatus(null);
      setError(AUTH_RESULT_COPY.missingFields);
      return;
    }
    if (mode === 'sign-up' && password.length < AUTH_MIN_PASSWORD_LENGTH) {
      setStatus(null);
      setError(AUTH_RESULT_COPY.weakPassword);
      return;
    }
    void run(() =>
      mode === 'sign-in'
        ? signInWithPassword(trimmedEmail, password)
        : signUpWithPassword(trimmedEmail, password, name.trim()),
    );
  }

  function clearMessages() {
    if (error) setError(null);
    if (status) setStatus(null);
  }

  const magicLink = isMagicLinkSignInEnabled() ? signInWithMagicLink : undefined;

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable
          className="max-h-[92%] rounded-t-3xl bg-paper px-4 pb-4 pt-3"
          style={{ paddingBottom: insets.bottom + 16 }}
          onPress={() => undefined}
        >
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-ink">{ACCOUNT_SHEET_COPY.authTitle}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Text className="text-sm font-bold text-muted">Close</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <BrandLogo variant="auth" />
            <Text className="mt-2 text-center text-sm text-muted">{APP_BRAND.copy.authCardSubtitle}</Text>
            <Text className="mt-1 text-center text-xs text-muted">{getAuthCardBlurb()}</Text>
            <View className="mt-4 flex-row gap-2">
              {(['sign-in', 'sign-up'] as const).map((tab) => (
                <Pressable
                  key={tab}
                  onPress={() => {
                    setMode(tab);
                    setResetting(false);
                    clearMessages();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === tab }}
                  className={`flex-1 rounded-xl px-3 py-2 ${mode === tab ? 'bg-emerald' : 'border border-border bg-card'}`}
                >
                  <Text
                    className={`text-center text-sm font-bold ${mode === tab ? 'text-on-emerald' : 'text-muted'}`}
                  >
                    {tab === 'sign-in' ? ACCOUNT_SHEET_COPY.signInTab : ACCOUNT_SHEET_COPY.signUpTab}
                  </Text>
                </Pressable>
              ))}
            </View>
            {resetting ? (
              <View className="mt-4">
                <Text className="text-base font-bold text-ink" accessibilityRole="header">
                  {AUTH_RESET_COPY.title}
                </Text>
                <Text className="mt-1 text-sm leading-5 text-muted">{AUTH_RESET_COPY.blurb}</Text>
              </View>
            ) : null}
            {mode === 'sign-up' ? (
              <TextInput
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-ink"
                placeholder={ACCOUNT_SHEET_COPY.displayNameLabel}
                accessibilityLabel={ACCOUNT_SHEET_COPY.displayNameLabel}
              />
            ) : null}
            <TextInput
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                clearMessages();
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-ink"
              placeholder="Email"
              accessibilityLabel="Email"
            />
            {resetting ? (
              <>
                <Pressable
                  disabled={busy}
                  onPress={submitReset}
                  accessibilityRole="button"
                  accessibilityState={{ busy }}
                  className={`mt-4 min-h-[44px] justify-center rounded-xl px-4 py-3 ${busy ? 'opacity-60 bg-emerald' : 'bg-emerald'}`}
                >
                  <Text className="text-center font-bold text-on-emerald">{AUTH_RESET_COPY.sendButton}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setResetting(false);
                    clearMessages();
                  }}
                  accessibilityRole="button"
                  className="mt-1 min-h-[44px] items-center justify-center"
                >
                  <Text className="text-sm font-bold text-primary">{AUTH_RESET_COPY.backToSignIn}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <TextInput
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    clearMessages();
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  onSubmitEditing={submitPassword}
                  className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-ink"
                  placeholder={mode === 'sign-up' ? 'Password (min 6 chars)' : 'Password'}
                  accessibilityLabel="Password"
                />
                {mode === 'sign-up' ? (
                  <Text className="mt-3 text-xs leading-4 text-muted">{AUTH_SIGN_UP_NOTE}</Text>
                ) : null}
                <Pressable
                  disabled={busy}
                  onPress={submitPassword}
                  accessibilityRole="button"
                  accessibilityState={{ busy }}
                  className={`mt-4 min-h-[44px] justify-center rounded-xl px-4 py-3 ${busy ? 'opacity-60 bg-emerald' : 'bg-emerald'}`}
                >
                  <Text className="text-center font-bold text-on-emerald">
                    {mode === 'sign-in' ? ACCOUNT_SHEET_COPY.signInTab : ACCOUNT_SHEET_COPY.signUpTab}
                  </Text>
                </Pressable>
                {mode === 'sign-in' ? (
                  <Pressable
                    onPress={() => {
                      setResetting(true);
                      setPassword('');
                      clearMessages();
                    }}
                    accessibilityRole="button"
                    className="mt-1 min-h-[44px] items-center justify-center"
                  >
                    <Text className="text-sm font-bold text-primary">{AUTH_RESET_COPY.forgotLink}</Text>
                  </Pressable>
                ) : null}
              </>
            )}
            {magicLink && !resetting ? (
              <Pressable
                disabled={busy || !email.trim()}
                onPress={() => void run(() => magicLink(email.trim()))}
                accessibilityRole="button"
                className="mt-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <Text className="text-center font-bold text-slate">{AUTH_MAGIC_LINK_COPY.buttonLabel}</Text>
              </Pressable>
            ) : null}
            {error ? (
              <Text className="mt-3 text-sm font-semibold text-danger" accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            {status ? (
              <Text className="mt-3 text-sm font-semibold text-emerald-dark" accessibilityRole="alert">
                {status}
              </Text>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
