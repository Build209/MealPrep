import { useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { signOut } from './actions';
import { useAuth } from './AuthProvider';
import { AUTH_SCREEN_COPY } from './copy';

/** Who is signed in, with a Sign out button. The tabs send people to sign-in once the session ends. */
export function SignOutCard() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignOut() {
    setBusy(true);
    setError(null);
    const result = await signOut(getSupabase()?.auth ?? null);
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <Card>
      <AppText variant="secondary" color="muted">
        {AUTH_SCREEN_COPY.signedInAs}
      </AppText>
      <AppText bold>{session?.user.email ?? ''}</AppText>
      <Button
        label={busy ? AUTH_SCREEN_COPY.busySignOut : AUTH_SCREEN_COPY.signOut}
        kind="secondary"
        disabled={busy}
        onPress={() => void onSignOut()}
      />
      {error ? (
        <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </Card>
  );
}
