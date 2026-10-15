import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { OFFLINE_MESSAGE, isOnlineNow } from '../data/online';
import { FORKY_IDEA } from '../forky/art';
import { ASK_FORKY_COPY, ASK_FORKY_LIMITS, questionsLeftText } from '../forky/copy';
import { useForkyAllowance } from '../forky/useForkyAllowance';
import { colors, fonts, radius, space, type as typeScale } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { HOME_COPY } from './copy';

/**
 * Ask Forky at the top of Home: a question box and Send. Sending opens the Ask Forky chat (/forky)
 * with the question, and the chat sends it the way its own Send does (one place calls the
 * ask-forky function: src/forky/ForkyChatScreen.tsx). The allowance line is the chat's
 * (useForkyAllowance), and the AI notice (compliance rules 9 and 17) is shown here word for word.
 * Offline: nothing is opened, the question stays in the box, and the app's offline line shows.
 * On a narrow screen (flip phone cover screen) Send wraps under the box, full size.
 */
export function HomeForkyBox() {
  const router = useRouter();
  const { session } = useAuth();
  const { allowance } = useForkyAllowance(session?.user.id ?? null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canSend = draft.trim().length > 0;

  function submit() {
    const question = draft.trim();
    if (!question) return;
    if (!isOnlineNow()) {
      setError(OFFLINE_MESSAGE);
      return;
    }
    setError(null);
    setDraft('');
    // `ask` makes each question its own request, even when the same words are asked twice.
    router.push({ pathname: '/forky', params: { q: question, ask: String(Date.now()) } });
  }

  return (
    <Card style={{ gap: space.gap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: colors.banana,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Image source={FORKY_IDEA} resizeMode="contain" accessible={false} style={{ width: 22, height: 36 }} />
        </View>
        <AppText variant="sectionTitle" bold style={{ flexShrink: 1 }}>
          {ASK_FORKY_COPY.title}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (error) setError(null);
          }}
          onSubmitEditing={submit}
          maxLength={ASK_FORKY_LIMITS.questionChars}
          placeholder={ASK_FORKY_COPY.placeholder}
          placeholderTextColor={colors.muted}
          accessibilityLabel={HOME_COPY.inputA11y}
          returnKeyType="send"
          testID="home-forky-input"
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 150,
            minWidth: 0,
            minHeight: 48,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.paper,
            paddingHorizontal: 16,
            color: colors.ink,
            fontFamily: fonts.body,
            ...typeScale.body,
          }}
        />
        <Button label={ASK_FORKY_COPY.send} accessibilityLabel={HOME_COPY.sendA11y} disabled={!canSend} onPress={submit} />
      </View>
      {error ? (
        <AppText variant="secondary" bold color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      {allowance.state === 'known' ? (
        <AppText variant="label" color="muted" testID="home-forky-left">
          {questionsLeftText(allowance.remaining)}
        </AppText>
      ) : null}
      <AppText variant="secondary">{ASK_FORKY_COPY.aiNotice}</AppText>
    </Card>
  );
}
