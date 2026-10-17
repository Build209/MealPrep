import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { OFFLINE_MESSAGE, isOnlineNow } from '../data/online';
import { FORKY_IDEA } from '../forky/art';
import { ASK_FORKY_COPY, ASK_FORKY_LIMITS, questionsLeftText } from '../forky/copy';
import { useForkyAllowance } from '../forky/useForkyAllowance';
import { colors, fonts, radius, touch, type as typeScale } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useAllergenPrefs } from '../allergens/useAllergenPrefs';
import { FEED_COPY, showFullForkyNotice } from './recipeLogic';

/**
 * A slim Ask Forky bar at the top of the Recipes tab (owner, 2026-10-17: option B of the mockup,
 * the compact bar). Same behaviour as Home's box (src/home/HomeForkyBox.tsx): Send opens the Ask
 * Forky chat (/forky) with the question, and the chat is the one place that calls the ask-forky
 * function and counts the allowance. Nothing is sent from here, so it spends the same monthly
 * questions as Home and the chat.
 *
 * The AI notice (compliance rules 9 and 17): on every visit to the tab the full ASK_FORKY_COPY.aiNotice
 * shows for NOTICE_FULL_MS at the 12 px label size, then shrinks to a one-line form that stays on
 * screen (owner, 2026-10-17: reminder each use, then it gets out of the way); a tap shows the full
 * text again. Screen readers always get the full text. Compliance to confirm before merge. The
 * questions-left line follows it in the same paragraph. Offline: nothing opens, the question stays in the box, and the app's
 * offline line shows.
 */
/** How long the full notice stays up each time the tab is opened, before it shrinks to one line. */
export const NOTICE_FULL_MS = 6000;

export function RecipesForkyBar() {
  const router = useRouter();
  const { session } = useAuth();
  const { allowance } = useForkyAllowance(session?.user.id ?? null);
  const { allergens, isLoading: allergensLoading } = useAllergenPrefs();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canSend = draft.trim().length > 0;
  // Full notice on every visit, then the short line; a tap on the short line brings the full text back.
  const [noticeOpen, setNoticeOpen] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setNoticeOpen(true);
      const timer = setTimeout(() => setNoticeOpen(false), NOTICE_FULL_MS);
      return () => clearTimeout(timer);
    }, []),
  );

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

  const left = allowance.state === 'known' ? ` ${questionsLeftText(allowance.remaining)}.` : '';
  // Saved allergens are sent with the question, so the full notice never collapses for them (compliance verdict, PR #356).
  const mustShowFull = allergensLoading || allergens.length > 0;
  const showFull = showFullForkyNotice({ noticeOpen, isLoading: allergensLoading, hasAllergens: allergens.length > 0 });
  const note = `${showFull ? ASK_FORKY_COPY.aiNotice : FEED_COPY.forkyNoticeShort}${left}`;

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${ASK_FORKY_COPY.aiNotice}${left}`}
        accessibilityState={{ expanded: showFull }}
        onPress={() => {
          if (!mustShowFull) setNoticeOpen((open) => !open);
        }}
        testID="recipes-forky-note-toggle"
      >
        <AppText variant="label" color="muted" testID="recipes-forky-note">
          {note}
        </AppText>
      </Pressable>
    </Card>
  );
}
