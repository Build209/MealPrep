import { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { parseChannel, signUpRedirect } from '../lib/channel';
import { env } from '../lib/env';
import { getSupabase } from '../lib/supabase';
import { colors, layout, radius, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { TopBar } from '../ui/TopBar';
import { requestPasswordReset, signIn, signUp } from './actions';
import { AgeCheckbox } from './AgeCheckbox';
import { AUTH_EMAIL_REDIRECT, AUTH_RESET_COPY, AUTH_RESULT_COPY, AUTH_SCREEN_COPY } from './copy';
import { Field } from './Field';
import { canSubmit, passwordResetRedirect, submitBlocker, type AuthActionResult, type AuthMode } from './logic';

/** Preview web builds send the "confirm your email" link back to the preview's own address. */
const confirmLinkTarget = signUpRedirect(
  parseChannel(env.appChannel),
  (globalThis as { location?: { origin?: string } }).location?.origin,
  AUTH_EMAIL_REDIRECT,
);

/** On the web, reset links come back to this app's own "Choose a new password" screen. */
const resetLinkTarget = passwordResetRedirect(
  Platform.OS === 'web',
  (globalThis as { location?: { origin?: string } }).location?.origin,
  AUTH_EMAIL_REDIRECT,
);

/**
 * Sign in, create an account, or ask for a password reset link. Once signed in, the
 * route sends people on to the tabs (the session arrives through AuthProvider).
 */
export function SignInScreen() {
  const supabase = getSupabase();
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
          {supabase ? <AuthForm /> : <NoServerSettings />}
        </View>
      </ScrollView>
    </View>
  );
}

function NoServerSettings() {
  return (
    <Card>
      <AppText variant="sectionTitle" bold accessibilityRole="header">
        {AUTH_SCREEN_COPY.noServerTitle}
      </AppText>
      <AppText color="muted">{AUTH_SCREEN_COPY.noServerBody}</AppText>
    </Card>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const form = { email, password, ageConfirmed };
  const blocker = submitBlocker(mode, form);
  const ready = canSubmit(mode, form, busy);
  const touched = email.length > 0 || password.length > 0 || ageConfirmed;

  function clearMessages() {
    setError(null);
    setNotice(null);
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setPassword('');
    clearMessages();
  }

  async function submit() {
    if (!ready) return;
    const auth = getSupabase()?.auth ?? null;
    setBusy(true);
    clearMessages();
    let result: AuthActionResult;
    try {
      result =
        mode === 'sign-in'
          ? await signIn(auth, email, password)
          : mode === 'sign-up'
            ? await signUp(auth, email, password, confirmLinkTarget)
            : await requestPasswordReset(auth, email, resetLinkTarget);
    } catch {
      result = { ok: false, error: AUTH_RESULT_COPY.generic };
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.notice) {
      setNotice(result.notice);
      setPassword('');
    }
    // A plain ok means signed in: AuthProvider gets the session and the route moves on.
  }

  const buttonLabel =
    mode === 'sign-in'
      ? busy
        ? AUTH_SCREEN_COPY.busySignIn
        : AUTH_SCREEN_COPY.signInTab
      : mode === 'sign-up'
        ? busy
          ? AUTH_SCREEN_COPY.busySignUp
          : AUTH_SCREEN_COPY.signUpTab
        : busy
          ? AUTH_SCREEN_COPY.busyReset
          : AUTH_RESET_COPY.sendButton;

  return (
    <>
      <AppText variant="pageTitle" display>
        {mode === 'reset' ? AUTH_RESET_COPY.title : mode === 'sign-up' ? AUTH_SCREEN_COPY.signUpTab : AUTH_SCREEN_COPY.signInTab}
      </AppText>
      <AppText color="muted">{mode === 'reset' ? AUTH_RESET_COPY.blurb : AUTH_SCREEN_COPY.blurb}</AppText>

      {mode !== 'reset' ? (
        <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
          <ModeTab label={AUTH_SCREEN_COPY.signInTab} selected={mode === 'sign-in'} onPress={() => switchMode('sign-in')} />
          <ModeTab label={AUTH_SCREEN_COPY.signUpTab} selected={mode === 'sign-up'} onPress={() => switchMode('sign-up')} />
        </View>
      ) : null}

      <Card style={{ gap: space.gap }}>
        <Field
          label={AUTH_SCREEN_COPY.emailLabel}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            clearMessages();
          }}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType={mode === 'reset' ? 'send' : 'next'}
          onSubmitEditing={mode === 'reset' ? () => void submit() : undefined}
        />

        {mode !== 'reset' ? (
          <Field
            label={AUTH_SCREEN_COPY.passwordLabel}
            hint={mode === 'sign-up' ? AUTH_SCREEN_COPY.newPasswordHint : undefined}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              clearMessages();
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        ) : null}

        {mode === 'sign-up' ? <AgeCheckbox checked={ageConfirmed} onChange={setAgeConfirmed} /> : null}

        <Button label={buttonLabel} main disabled={!ready} onPress={() => void submit()} />

        {blocker && touched && !error && !notice ? (
          <AppText variant="secondary" color="muted">
            {blocker}
          </AppText>
        ) : null}
        {error ? (
          <AppText variant="secondary" color="danger" bold accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}
        {notice ? (
          <AppText variant="secondary" color="success" bold accessibilityRole="alert" accessibilityLiveRegion="polite">
            {notice}
          </AppText>
        ) : null}
      </Card>

      {mode === 'sign-in' ? (
        <Button label={AUTH_RESET_COPY.forgotLink} kind="quiet" onPress={() => switchMode('reset')} />
      ) : null}
      {mode === 'reset' ? (
        <Button label={AUTH_RESET_COPY.backToSignIn} kind="quiet" onPress={() => switchMode('sign-in')} />
      ) : null}
    </>
  );
}

function ModeTab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      aria-selected={selected}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: touch.min,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        backgroundColor: selected ? colors.ink : colors.card,
        borderWidth: 1,
        borderColor: selected ? colors.ink : colors.border,
      }}
    >
      <AppText variant="button" color={selected ? 'onPrimary' : 'ink'}>
        {label}
      </AppText>
    </Pressable>
  );
}
