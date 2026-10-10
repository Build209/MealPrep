import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from '../BrandLogo';
import { APP_BRAND } from '../../config/appBrand';
import {
  AUTH_MAGIC_LINK_COPY,
  getAuthCardBlurb,
  isMagicLinkSignInEnabled,
} from '../../config/authConfig';
import { ACCOUNT_SHEET_COPY } from '../../config/account';
import { useApp } from '../../context/AppContext';

type AuthSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function AuthSheet({ visible, onClose }: AuthSheetProps) {
  const insets = useSafeAreaInsets();
  const { authError, signInWithPassword, signUpWithPassword, signInWithMagicLink } = useApp();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus(success);
      onClose();
    } finally {
      setBusy(false);
    }
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
                  onPress={() => setMode(tab)}
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
            {mode === 'sign-up' ? (
              <TextInput
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-ink"
                placeholder={ACCOUNT_SHEET_COPY.displayNameLabel}
              />
            ) : null}
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-ink"
              placeholder="Email"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-ink"
              placeholder={mode === 'sign-up' ? 'Password (min 6 chars)' : 'Password'}
            />
            <Pressable
              disabled={busy || !email.trim()}
              onPress={() =>
                void run(
                  () =>
                    mode === 'sign-in'
                      ? signInWithPassword(email.trim(), password)
                      : signUpWithPassword(email.trim(), password, name.trim()),
                  mode === 'sign-in' ? 'Signed in.' : 'Account created.',
                )
              }
              className={`mt-4 rounded-xl px-4 py-3 ${busy ? 'opacity-60 bg-emerald' : 'bg-emerald'}`}
            >
              <Text className="text-center font-bold text-on-emerald">
                {mode === 'sign-in' ? ACCOUNT_SHEET_COPY.signInTab : ACCOUNT_SHEET_COPY.signUpTab}
              </Text>
            </Pressable>
            {magicLink ? (
              <Pressable
                disabled={busy || !email.trim()}
                onPress={() =>
                  void run(() => magicLink(email.trim()), AUTH_MAGIC_LINK_COPY.successMessage)
                }
                className="mt-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <Text className="text-center font-bold text-slate">{AUTH_MAGIC_LINK_COPY.buttonLabel}</Text>
              </Pressable>
            ) : null}
            {authError ? <Text className="mt-3 text-sm text-danger">{authError}</Text> : null}
            {status ? <Text className="mt-2 text-sm text-emerald-dark">{status}</Text> : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
