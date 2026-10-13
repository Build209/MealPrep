import { Redirect } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { SignInScreen } from '../auth/SignInScreen';

/** Signed-out home. Once a session arrives, go to the tabs. */
export default function SignInRoute() {
  const { ready, session } = useAuth();
  if (ready && session) return <Redirect href="/" />;
  return <SignInScreen />;
}
