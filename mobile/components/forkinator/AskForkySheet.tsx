import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Modal } from '../BackAwareModal';
import { THEME } from '../../config/appConfig';
import { ASK_FORKY_COPY, ASK_FORKY_LIMITS } from '../../config/askForky';
import { useApp } from '../../context/AppContext';
import { askForky, AskForkyError, type AskForkyContext, type AskForkyTurn } from '../../lib/forky/askForky';
import { canBuyPlusHere } from '../billing/PlusUpgradeOptions';
import { PlusUpgradeSheet } from '../billing/PlusUpgradeSheet';
import { logUsageEvent } from '../../lib/usage/usageLog';
import { recentlyCookedTitles } from '../../lib/forky/askForkyRequest';
import { readUsualItemHistory, topUsualItemNames } from '../../lib/usual/usualItems';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Opens a recipe Forky recommended (ids come from the shortlist the app sent). */
  onOpenRecipe: (recipeId: string) => void;
  /** Falls back to the existing three-question quiz, which needs no AI. */
  onHelpMePick: () => void;
};

type ChatMessage = {
  key: string;
  role: 'user' | 'forky';
  text: string;
  recipeIds?: string[];
  safetyNote?: boolean;
};

const FORKY: number = require('../../assets/forkinator/forkinator-idea.png');

/**
 * Ask Forky: a short chat answered by an AI model through our server.
 * - The chat lives only on this screen; closing the app forgets it. Nothing is stored on the server.
 * - The line saying Forky is an AI and can be wrong is always visible.
 * - Recipe buttons only ever open recipes the app itself put on the shortlist.
 */
export function AskForkySheet({ visible, onClose, onOpenRecipe, onHelpMePick }: Props) {
  const { pantry, pantryRecipeMatchesRankedFiltered, isGuest, demoMode, openAuthSheet, mealPlan, profile } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState<'free' | 'plus' | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const nextKey = useRef(0);

  const context: AskForkyContext = useMemo(
    () => ({
      pantry: pantry.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        expiresOn: item.expiresOn,
      })),
      recipes: pantryRecipeMatchesRankedFiltered.slice(0, ASK_FORKY_LIMITS.recipes),
      // What the app has learned about this household, so answers fit (no diet or health details).
      // Read when the chat opens, so it reflects what was bought and cooked up to now.
      household: {
        householdSize: profile.householdSize,
        usualItems: visible ? topUsualItemNames(readUsualItemHistory(), ASK_FORKY_LIMITS.usualItems) : [],
        cookedRecently: recentlyCookedTitles(mealPlan, new Date()),
      },
    }),
    [mealPlan, pantry, pantryRecipeMatchesRankedFiltered, profile.householdSize, visible],
  );

  const recipeTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const match of pantryRecipeMatchesRankedFiltered) map.set(match.recipeId, match.recipeName);
    return map;
  }, [pantryRecipeMatchesRankedFiltered]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages, busy, visible]);

  const signedOut = isGuest && !demoMode;
  const canSend = !busy && !limitReached && !signedOut && draft.trim().length > 0;

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || limitReached || signedOut) return;
    if (question.length > ASK_FORKY_LIMITS.questionChars) {
      setError(ASK_FORKY_COPY.tooLong);
      return;
    }
    const history: AskForkyTurn[] = messages.map((message) => ({ role: message.role, text: message.text }));
    setMessages((current) => [...current, { key: `m${nextKey.current++}`, role: 'user', text: question }]);
    setDraft('');
    setError(null);
    setBusy(true);
    try {
      const reply = await askForky(question, history, context);
      logUsageEvent('ask_forky_asked');
      setMessages((current) => [
        ...current,
        {
          key: `m${nextKey.current++}`,
          role: 'forky',
          text: reply.answer,
          recipeIds: reply.recipeIds,
          safetyNote: reply.safetyNote,
        },
      ]);
      setRemaining(reply.remaining);
    } catch (err) {
      // Take the unanswered question back off the screen and put it back in the box.
      setMessages((current) => current.slice(0, -1));
      setDraft(question);
      if (err instanceof AskForkyError && err.code === 'LIMIT_REACHED') {
        setLimitReached(err.isPlus ? 'plus' : 'free');
        setRemaining(0);
      } else {
        setError(err instanceof AskForkyError ? err.message : ASK_FORKY_COPY.genericError);
      }
    } finally {
      setBusy(false);
    }
  }

  function openRecipe(recipeId: string) {
    onClose();
    onOpenRecipe(recipeId);
  }

  function helpMePick() {
    onClose();
    onHelpMePick();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 bg-cream"
      >
        <View className="h-16 flex-row items-center justify-between bg-primary pl-4 pr-3">
          <View className="flex-row items-center gap-2.5">
            <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-cream">
              <Image source={FORKY} resizeMode="contain" accessible={false} style={{ width: 22, height: 36 }} />
            </View>
            <Text accessibilityRole="header" className="text-[19px] font-extrabold text-cream">
              {ASK_FORKY_COPY.title}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={ASK_FORKY_COPY.close}
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <Text className="text-2xl font-bold text-cream">×</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-md self-center">
            <Text className="text-sm leading-5 text-ink">{ASK_FORKY_COPY.aiNotice}</Text>

            <View className="mt-4 self-start rounded-[18px] border border-border bg-card px-4 py-3">
              <Text className="text-base leading-6 text-ink">{ASK_FORKY_COPY.intro}</Text>
            </View>

            {messages.map((message) =>
              message.role === 'user' ? (
                <View key={message.key} className="mt-3 max-w-[88%] self-end rounded-[18px] bg-primary px-4 py-3">
                  <Text className="text-base leading-6 text-cream">{message.text}</Text>
                </View>
              ) : (
                <View
                  key={message.key}
                  className="mt-3 max-w-[92%] self-start rounded-[18px] border border-border bg-card px-4 py-3"
                >
                  <Text className="text-base leading-6 text-ink">{message.text}</Text>
                  {message.safetyNote ? (
                    <Text className="mt-2 text-sm leading-5 text-muted">{ASK_FORKY_COPY.safetyNote}</Text>
                  ) : null}
                  {(message.recipeIds ?? []).map((recipeId) => {
                    const title = recipeTitles.get(recipeId);
                    if (!title) return null;
                    return (
                      <Pressable
                        key={recipeId}
                        onPress={() => openRecipe(recipeId)}
                        accessibilityRole="button"
                        accessibilityLabel={`${ASK_FORKY_COPY.openRecipe}: ${title}`}
                        className="mt-2 min-h-[44px] justify-center rounded-full border border-primary bg-primary-light px-4 py-2"
                      >
                        <Text className="text-sm font-bold text-primary" numberOfLines={2}>
                          {title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ),
            )}

            {busy ? (
              <Text accessibilityLiveRegion="polite" className="mt-3 text-sm font-semibold text-muted">
                {ASK_FORKY_COPY.thinking}
              </Text>
            ) : null}

            {error ? (
              <Text accessibilityRole="alert" className="mt-3 text-sm font-semibold text-danger">
                {error}
              </Text>
            ) : null}

            {signedOut ? (
              <View className="mt-4 rounded-[18px] border border-border bg-card px-4 py-4">
                <Text className="text-base font-extrabold text-ink">{ASK_FORKY_COPY.signInTitle}</Text>
                <Text className="mt-1 text-sm leading-5 text-muted">{ASK_FORKY_COPY.signInBody}</Text>
                <Pressable
                  onPress={() => {
                    onClose();
                    openAuthSheet();
                  }}
                  accessibilityRole="button"
                  className="mt-3 min-h-[44px] items-center justify-center rounded-full bg-primary px-4"
                >
                  <Text className="text-sm font-bold text-cream">{ASK_FORKY_COPY.signIn}</Text>
                </Pressable>
              </View>
            ) : null}

            {limitReached ? (
              <View className="mt-4 rounded-[18px] border border-border bg-card px-4 py-4">
                <Text className="text-base leading-6 text-ink">
                  {limitReached === 'plus' ? ASK_FORKY_COPY.limitPlus : ASK_FORKY_COPY.limitFree}
                </Text>
                {limitReached === 'free' && canBuyPlusHere() ? (
                  <Pressable
                    onPress={() => setPlusOpen(true)}
                    accessibilityRole="button"
                    className="mt-3 min-h-[44px] items-center justify-center rounded-full bg-primary px-4"
                  >
                    <Text className="text-sm font-bold text-cream">{ASK_FORKY_COPY.seePlus}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={helpMePick}
                  accessibilityRole="button"
                  className="mt-2 min-h-[44px] items-center justify-center rounded-full border border-primary bg-card px-4"
                >
                  <Text className="text-sm font-bold text-primary">{ASK_FORKY_COPY.helpMePick}</Text>
                </Pressable>
              </View>
            ) : null}

            {messages.length === 0 && !signedOut && !limitReached ? (
              <View className="mt-4 flex-row flex-wrap gap-2">
                {ASK_FORKY_COPY.quickReplies.map((quick) => (
                  <Pressable
                    key={quick}
                    onPress={() => void send(quick)}
                    disabled={busy}
                    accessibilityRole="button"
                    className="min-h-[44px] justify-center rounded-full border border-border bg-card px-4"
                  >
                    <Text className="text-sm font-semibold text-ink">{quick}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View className="border-t border-border bg-cream px-5 pb-4 pt-3">
          <View className="w-full max-w-md self-center">
            {remaining !== null && remaining <= 3 && !limitReached ? (
              <Text className="mb-2 text-xs font-semibold text-muted">{ASK_FORKY_COPY.remaining(remaining)}</Text>
            ) : null}
            <View className="flex-row items-center gap-2">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => void send(draft)}
                editable={!signedOut && !limitReached}
                maxLength={ASK_FORKY_LIMITS.questionChars}
                placeholder={ASK_FORKY_COPY.placeholder}
                placeholderTextColor={THEME.muted}
                accessibilityLabel={ASK_FORKY_COPY.placeholder}
                returnKeyType="send"
                className="min-h-[48px] flex-1 rounded-full border border-border bg-card px-4 text-base text-ink"
              />
              <Pressable
                onPress={() => void send(draft)}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSend, busy }}
                className={`min-h-[48px] items-center justify-center rounded-full bg-primary px-5 ${
                  canSend ? '' : 'opacity-50'
                }`}
              >
                <Text className="text-[15px] font-extrabold text-cream">{ASK_FORKY_COPY.send}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      <PlusUpgradeSheet visible={plusOpen} onClose={() => setPlusOpen(false)} />
    </Modal>
  );
}
