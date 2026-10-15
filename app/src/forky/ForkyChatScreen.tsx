import { Link, Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useForkyMessagesUsed, useForkyRecipes, useRefreshForkyUsage } from '../data/forkyChat';
import { usePantryItems } from '../data/pantry';
import { useProfile } from '../data/profile';
import { env } from '../lib/env';
import { logEvent } from '../lib/events';
import { currentUsagePeriod } from '../scan/allowance';
import { colors, fonts, layout, radius, space, touch, type as typeScale } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { forkyAllowanceFor, forkyTierFor, forkyUsedUp, morePlansExist } from './allowance';
import { createForkyAsker } from './api';
import { FORKY_IDEA } from './art';
import { forkyChat, usageForPeriod, type ChatMessage } from './chatStore';
import { ASK_FORKY_COPY, ASK_FORKY_LIMITS, questionsLeftText } from './copy';
import { askForkyUrl, ForkyError, needsSafetyNote, type ForkyTurn } from './request';
import { rankShortlist, recipeButtons } from './shortlist';

const askForky = createForkyAsker({ url: askForkyUrl(env.supabaseUrl) });

function Bubble({ message, onOpen }: { message: ChatMessage; onOpen: (href: string) => void }) {
  if (message.role === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: colors.primary, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 12 }}>
        <AppText color="onPrimary">{message.text}</AppText>
      </View>
    );
  }
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        maxWidth: '92%',
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
      }}
    >
      <AppText>{message.text}</AppText>
      {message.safetyNote ? (
        <AppText variant="secondary" color="muted">
          {ASK_FORKY_COPY.safetyNote}
        </AppText>
      ) : null}
      {(message.recipes ?? []).map((recipe) => (
        <Pressable
          key={recipe.id}
          onPress={() => onOpen(recipe.href)}
          accessibilityRole="button"
          accessibilityLabel={`${ASK_FORKY_COPY.openRecipe}: ${recipe.title}`}
          style={{
            minHeight: touch.min,
            justifyContent: 'center',
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.ink,
            backgroundColor: colors.sand,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <AppText variant="secondary" bold numberOfLines={2}>
            {recipe.title}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Ask Forky (/forky): a short chat answered by an AI model through the live ask-forky function.
 * - The line saying Forky is an AI and can be wrong is always on screen (compliance rules 9, 17).
 * - The chat is kept in memory for this session only (chatStore.ts): never stored.
 * - Recipe buttons open only recipes the app itself put on the shortlist.
 * - "N questions left this month" from forky_chat_usage and the plan's limit; the server decides.
 */
export function ForkyChatScreen() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = session?.user.id ?? null;
  const chat = useSyncExternalStore(forkyChat.subscribe, () => forkyChat.snapshot(userId), () => forkyChat.snapshot(userId));
  const profile = useProfile();
  const pantry = usePantryItems();
  const recipes = useForkyRecipes();
  const used = useForkyMessagesUsed();
  const refreshUsage = useRefreshForkyUsage();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const period = currentUsagePeriod();
  const tier = profile.data ? forkyTierFor(profile.data) : null;
  const allowance = forkyAllowanceFor(tier, used.data ?? null, usageForPeriod(chat.serverUsage, period));
  const usedUp = forkyUsedUp(allowance);

  const shortlist = useMemo(
    () => rankShortlist(recipes.data ?? [], pantry.data ?? []),
    [recipes.data, pantry.data],
  );

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [chat.messages.length, busy]);

  if (ready && !session) return <Redirect href="/sign-in" />;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const canSend = !busy && !usedUp && draft.trim().length > 0;

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || usedUp) return;
    if (question.length > ASK_FORKY_LIMITS.questionChars) {
      setError(ASK_FORKY_COPY.tooLong);
      return;
    }
    const history: ForkyTurn[] = chat.messages.map((m) => ({ role: m.role, text: m.text }));
    const sentShortlist = shortlist;
    const asked = forkyChat.add(userId, { role: 'user', text: question });
    setDraft('');
    setError(null);
    setBusy(true);
    try {
      const reply = await askForky({
        question,
        history,
        context: {
          pantry: (pantry.data ?? []).map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit, expiresOn: item.expiresOn })),
          recipes: sentShortlist,
          householdSize: profile.data?.householdSize ?? null,
        },
        accessToken: session?.access_token ?? null,
      });
      forkyChat.add(userId, {
        role: 'forky',
        text: reply.answer,
        recipes: reply.offTopic ? [] : recipeButtons(reply.recipeIds, sentShortlist),
        safetyNote: needsSafetyNote(question, reply),
      });
      logEvent('ask_forky_asked'); // no question text, only that one was answered
      if (reply.limit !== null && reply.remaining !== null) {
        forkyChat.setServerUsage(userId, { period, limit: reply.limit, remaining: reply.remaining });
      }
      refreshUsage();
    } catch (thrown) {
      // Take the unanswered question back off the screen and put it back in the box.
      forkyChat.remove(userId, asked.key);
      setDraft(question);
      if (thrown instanceof ForkyError && thrown.kind === 'used-up') {
        const limit = thrown.limit ?? (allowance.state === 'known' ? allowance.limit : 0);
        forkyChat.setServerUsage(userId, { period, limit, remaining: 0 });
        refreshUsage();
      }
      setError(thrown instanceof ForkyError ? thrown.message : ASK_FORKY_COPY.genericError);
    } finally {
      setBusy(false);
    }
  }

  const usedUpText = allowance.state === 'known' && allowance.tier === 'free' ? ASK_FORKY_COPY.limitFree : ASK_FORKY_COPY.limitPlus;
  // When the refusal said it already, the card says it; the error line would repeat it.
  const errorText = usedUp && error === usedUpText ? null : error;
  const column = { width: '100%' as const, maxWidth: layout.maxWidth, alignSelf: 'center' as const };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ backgroundColor: colors.banana, paddingTop: insets.top }}>
        <View style={[column, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space.gutter, paddingRight: 8, paddingVertical: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <Image source={FORKY_IDEA} resizeMode="contain" accessible={false} style={{ width: 22, height: 36 }} />
            </View>
            <AppText variant="pageTitle" display color="onBanana">
              {ASK_FORKY_COPY.title}
            </AppText>
          </View>
          <Button label={ASK_FORKY_COPY.close} kind="quiet" onPress={close} />
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: space.gutter, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        <View style={[column, { gap: space.gap }]}>
          <AppText variant="secondary">{ASK_FORKY_COPY.aiNotice}</AppText>

          <View style={{ alignSelf: 'flex-start', backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 12 }}>
            <AppText>{ASK_FORKY_COPY.intro}</AppText>
          </View>

          {chat.messages.map((message) => (
            <Bubble key={message.key} message={message} onOpen={(href) => router.push(href)} />
          ))}

          {busy ? (
            <AppText variant="secondary" bold color="muted" accessibilityLiveRegion="polite">
              {ASK_FORKY_COPY.thinking}
            </AppText>
          ) : null}

          {errorText ? (
            <AppText variant="secondary" bold color="danger" accessibilityRole="alert">
              {errorText}
            </AppText>
          ) : null}

          {usedUp ? (
            <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: space.cardPadding, gap: 12 }}>
              <AppText accessibilityRole="alert">{usedUpText}</AppText>
              {morePlansExist(tier) ? (
                <Link href="/plans" asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={ASK_FORKY_COPY.seePlans}
                    style={{ minHeight: touch.min, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}
                  >
                    <AppText variant="button" color="onPrimary">
                      {ASK_FORKY_COPY.seePlans}
                    </AppText>
                  </Pressable>
                </Link>
              ) : null}
            </View>
          ) : null}

          {chat.messages.length === 0 && !usedUp ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ASK_FORKY_COPY.quickReplies.map((quick) => (
                <Button key={quick} label={quick} kind="secondary" disabled={busy} onPress={() => void send(quick)} />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.paper, paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: 12 + insets.bottom }}>
        <View style={[column, { gap: 8 }]}>
          {allowance.state === 'known' ? (
            <AppText variant="label" color="muted">
              {questionsLeftText(allowance.remaining)}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => void send(draft)}
              editable={!usedUp}
              maxLength={ASK_FORKY_LIMITS.questionChars}
              placeholder={ASK_FORKY_COPY.placeholder}
              placeholderTextColor={colors.muted}
              accessibilityLabel={ASK_FORKY_COPY.inputLabel}
              returnKeyType="send"
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                paddingHorizontal: 16,
                color: colors.ink,
                fontFamily: fonts.body,
                ...typeScale.body,
              }}
            />
            <Button label={ASK_FORKY_COPY.send} disabled={!canSend} onPress={() => void send(draft)} />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
