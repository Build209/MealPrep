import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { getSupabase, openedWith } from '../lib/supabase';
import { colors, layout, space } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { updatePassword } from './actions';
import { useAuth } from './AuthProvider';
import { AUTH_RESET_COPY, AUTH_RESULT_COPY, AUTH_SCREEN_COPY } from './copy';
import { Field } from './Field';
import { newPasswordBlocker, passwordResetLinkState, resetScreenState, type AuthActionResult } from './logic';

/** Read once: supabase-js removes the link's tokens from the address after using them. */
const linkState = passwordResetLinkState(openedWith.hash, openedWith.search);

/**
 * "Choose a new password", opened from the link in a reset email. The link signs the person in
 * (supabase-js reads it from the address); here they pick a new password, then go to Home.
 */
export function ResetPasswordScreen() {
  const { ready, session, recovery } = useAuth();
  const state = resetScreenState({ ready, hasSession: session !== null, recovery, link: linkState });
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <TopBar />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center' }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={{ width: '100%', maxWidth: layout.maxWidth, padding: space.gutter, gap: space.gap }}>
          <AppText variant="pageTitle" display>
            {AUTH_RESET_COPY.newPasswordTitle}
          </AppText>
          {state === 'checking' ? <Checking /> : state === 'form' ? <NewPasswordForm /> : <LinkExpired />}
        </View>
      </ScrollView>
    </View>
  );
}

function Checking() {
  return (
    <View style={{ alignItems: 'center', gap: space.gap }}>
      <ActivityIndicator color={colors.ink} accessibilityLabel={AUTH_RESET_COPY.checkingLink} />
      <AppText color="muted">{AUTH_RESET_COPY.checkingLink}</AppText>
    </View>
  );
}

function LinkExpired() {
  const router = useRouter();
  return (
    <Card style={{ gap: space.gap }}>
      <AppText color="danger" bold accessibilityRole="alert">
        {AUTH_RESET_COPY.linkExpired}
      </AppText>
      <Button label={AUTH_RESET_COPY.backToSignIn} onPress={() => router.replace('/sign-in')} />
    </Card>
  );
}

function NewPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocker = newPasswordBlocker(password, again);
  const ready = !busy && blocker === null;
  const touched = password.length > 0 || again.length > 0;

  async function save() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    let result: AuthActionResult;
    try {
      result = await updatePassword(getSupabase()?.auth ?? null, password, again);
    } catch {
      result = { ok: false, error: AUTH_RESULT_COPY.generic };
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/');
  }

  return (
    <>
      <AppText color="muted">{AUTH_RESET_COPY.newPasswordBlurb}</AppText>
      <Card style={{ gap: space.gap }}>
        <Field
          label={AUTH_RESET_COPY.newPasswordLabel}
          hint={AUTH_SCREEN_COPY.newPasswordHint}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          returnKeyType="next"
        />
        <Field
          label={AUTH_RESET_COPY.confirmPasswordLabel}
          value={again}
          onChangeText={(text) => {
            setAgain(text);
            setError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={() => void save()}
        />
        <Button
          label={busy ? AUTH_RESET_COPY.busySave : AUTH_RESET_COPY.saveButton}
          main
          disabled={!ready}
          onPress={() => void save()}
        />
        {blocker && touched && !error ? (
          <AppText variant="secondary" color="muted">
            {blocker}
          </AppText>
        ) : null}
        {error ? (
          <AppText variant="secondary" color="danger" bold accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}
      </Card>
      <Button label={AUTH_RESET_COPY.notNow} kind="quiet" onPress={() => router.replace('/')} />
    </>
  );
}
