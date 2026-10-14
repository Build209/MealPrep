import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { AUTH_SCREEN_COPY, LEGAL_LINKS } from '../auth/copy';
import { colors } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { ACCOUNT_DELETE_COPY as COPY, SUPPORT_EMAIL } from './copy';
import { deleteOwnAccount } from './deleteAccount';
import { deleteFailure } from './deleteRequest';

function openUrl(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

/**
 * The delete button, then the confirm step (the old app's confirm dialog, shown in place), with a
 * busy state and plain-words errors. No tomato here: tomato is for camera or money only.
 */
function DeleteControls({ email }: { email: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDelete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await deleteOwnAccount().catch(() => deleteFailure('server'));
    if (outcome.ok) {
      // Signing out also sends the tabs to sign-in; either way sign-in says the account was deleted.
      router.replace('/sign-in');
      return;
    }
    setBusy(false);
    setError(outcome.message);
  }

  return (
    <Card>
      <AppText variant="secondary" color="muted">
        {AUTH_SCREEN_COPY.signedInAs}
      </AppText>
      <AppText bold>{email}</AppText>

      {confirming ? (
        <View style={{ gap: 8, marginTop: 8 }} testID="delete-confirm">
          <AppText variant="sectionTitle">{COPY.confirmTitle}</AppText>
          <AppText>{COPY.confirmBody}</AppText>
          <Button
            label={busy ? COPY.busy : COPY.confirmAction}
            disabled={busy}
            onPress={() => void runDelete()}
          />
          {busy ? <ActivityIndicator color={colors.ink} accessibilityLabel={COPY.busy} /> : null}
          <Button
            label={COPY.cancel}
            kind="secondary"
            disabled={busy}
            onPress={() => {
              setConfirming(false);
              setError(null);
            }}
          />
        </View>
      ) : (
        <Button label={COPY.deleteButton} kind="secondary" onPress={() => setConfirming(true)} />
      )}

      {error ? (
        <AppText variant="secondary" color="danger" bold accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </Card>
  );
}

/**
 * /delete-account: the same address as the live page, which the privacy policy and terms link to.
 * Says what is deleted (and that Plus is cancelled), then the delete and confirm step for a signed-in
 * person, or a way to sign in. After deleting, the person is signed out and taken to sign-in.
 */
export function DeleteAccountScreen() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen title={COPY.title}>
      <Button label={COPY.close} kind="quiet" onPress={close} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <AppText>{COPY.whatIsDeleted}</AppText>

      {!ready ? (
        <ActivityIndicator color={colors.ink} />
      ) : session ? (
        <DeleteControls email={session.user.email ?? ''} />
      ) : (
        <Card>
          <AppText variant="secondary">{COPY.signedOutHint}</AppText>
          <Button label={COPY.signIn} onPress={() => router.replace('/sign-in')} />
        </Card>
      )}

      <AppText variant="secondary" color="muted">
        {COPY.helpBefore}{' '}
        <AppText
          variant="secondary"
          bold
          accessibilityRole="link"
          onPress={() => openUrl(`mailto:${SUPPORT_EMAIL}`)}
          style={{ textDecorationLine: 'underline' }}
        >
          {SUPPORT_EMAIL}
        </AppText>{' '}
        {COPY.helpAfter}
      </AppText>
      <AppText
        bold
        accessibilityRole="link"
        onPress={() => openUrl(LEGAL_LINKS.privacy)}
        style={{ alignSelf: 'flex-start', textDecorationLine: 'underline', paddingVertical: 10 }}
      >
        {COPY.privacyLink}
      </AppText>
    </Screen>
  );
}
