import { Link } from 'expo-router';
import { AppText } from '../ui/AppText';
import { Screen } from '../ui/Screen';

export default function NotFound() {
  return (
    <Screen title="Page not found">
      <AppText color="muted">That page does not exist.</AppText>
      <Link href="/">
        <AppText bold>Go to Home</AppText>
      </Link>
    </Screen>
  );
}
