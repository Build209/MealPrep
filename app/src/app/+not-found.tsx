import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Screen } from '../ui/Screen';

export default function NotFound() {
  return (
    <Screen title="Page not found">
      <AppText color="muted">That page does not exist.</AppText>
      {/* A 44px-tall tap target (the phone pass checks it), not just the text line. */}
      <Link href="/" asChild>
        <Pressable accessibilityRole="link" style={{ minHeight: touch.min, minWidth: touch.min, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <AppText bold>Go to Home</AppText>
        </Pressable>
      </Link>
    </Screen>
  );
}
