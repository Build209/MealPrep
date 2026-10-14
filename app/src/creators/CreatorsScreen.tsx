import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { CreatorVideosRow } from './CreatorVideosRow';

/** /creators: the creator videos row on its own page, also reached from "See all creator videos" on Home. */
export function CreatorsScreen() {
  const { ready, session } = useAuth();
  const router = useRouter();
  if (ready && !session) return <Redirect href="/sign-in" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Screen title="Creator videos">
      <Button label="Back" kind="quiet" onPress={back} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      <AppText color="muted">Recent recipe videos from the cooks we follow. They open outside the app.</AppText>
      <CreatorVideosRow title={null} />
      <Button label="Search recipes and videos" kind="secondary" onPress={() => router.push('/recipes/search')} />
      <Button label="Saved recipes" kind="secondary" onPress={() => router.push('/recipes/saved')} />
    </Screen>
  );
}
