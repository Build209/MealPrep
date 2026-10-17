import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { OFFLINE_MESSAGE, isOnlineNow } from '../data/online';
import { FORKY_IDEA } from '../forky/art';
import { ASK_FORKY_COPY, ASK_FORKY_LIMITS, questionsLeftText } from '../forky/copy';
import { useForkyAllowance } from '../forky/useForkyAllowance';
import { colors, fonts, radius, touch, type as typeScale } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FEED_COPY } from './recipeLogic';

/**
 * A slim Ask Forky bar at the top of the Recipes tab (owner, 2026-10-17: option B of the mockup,
 * the compact bar). Same behaviour as Home's box (src/home/HomeForkyBox.tsx): Send opens the Ask
 * Forky chat (/forky) with the question, and the chat is the one place that calls the ask-forky
 * function and counts the allowance. Nothing is sent from here, so it spends the same monthly
 * questions as Home and the chat.
 *
 * The AI notice (compliance rules 9 and 17) is word for word ASK_FORKY_COPY.aiNotice, always on
 * screen, here at the 12 px label size so the bar stays one row; the questions-left line follows
 * it in the same paragraph. Offline: nothing opens, the question stays in the box, and the app's
 * offline line shows.
 */
export function RecipesForkyBar() {
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

  const note =
    allowance.state === 'known'
      ? `${ASK_FORKY_COPY.aiNotice} ${questionsLeftText(allowance.remaining)}.`
      : ASK_FORKY_COPY.aiNotice;

  return (
    <Card style={{ gap: 6, paddingVertical: 10, paddingLeft: 12, paddingRight: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.pill,
            backgroundColor: colors.banana,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Image source={FORKY_IDEA} resizeMode="contain" accessible={false} style={{ width: 20, height: 32 }} />
        </View>
        <TextInput
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (error) setError(null);
          }}
          onSubmitEditing={submit}
          maxLength={ASK_FORKY_LIMITS.questionChars}
          placeholder={FEED_COPY.forkyPlaceholder}
          placeholderTextColor={colors.muted}
          accessibilityLabel={FEED_COPY.forkyInputA11y}
          returnKeyType="send"
          testID="recipes-forky-input"
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 130,
            minWidth: 0,
            minHeight: touch.min,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.paper,
            paddingHorizontal: 14,
            color: colors.ink,
            fontFamily: fonts.body,
            ...typeScale.body,
          }}
        />
        <Button label={ASK_FORKY_COPY.send} accessibilityLabel={FEED_COPY.forkySendA11y} disabled={!canSend} onPress={submit} />
      </View>
      {error ? (
        <AppText variant="secondary" bold color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <AppText variant="label" color="muted" testID="recipes-forky-note">
        {note}
      </AppText>
    </Card>
  );
}
