import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COOK_COPY } from '../../config/cookCopy';
import { THEME } from '../../config/appConfig';
import { useCookSession } from '../../hooks/useCookSession';
import {
  currentStepIndex,
  formatClock,
  timerProgress,
  timerRemainingSec,
  timerStatus,
  type CookTimerStatus,
} from '../../lib/cook/cookSession';
import { keepScreenAwake } from '../../lib/cook/keepAwake';
import { formatIngredientAmount } from '../../lib/formatQuantity';
import { Ionicons } from '../../lib/icons/Ionicons';
import type { Recipe } from '../../types/mealprep';

function statusText(status: CookTimerStatus): string {
  switch (status) {
    case 'running':
      return COOK_COPY.timerRunning;
    case 'paused':
      return COOK_COPY.timerPaused;
    case 'finished':
      return COOK_COPY.timerFinished;
    default:
      return COOK_COPY.timerReady;
  }
}

function startButtonText(status: CookTimerStatus): string {
  switch (status) {
    case 'running':
      return COOK_COPY.timerPause;
    case 'paused':
      return COOK_COPY.timerResume;
    case 'finished':
      return COOK_COPY.timerRestart;
    default:
      return COOK_COPY.timerStart;
  }
}

/**
 * Full-screen cooking dashboard for one recipe: the current step, timers that run side by
 * side, the step list and an ingredient checklist. Everything stays on this device.
 */
export function CookDashboard({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const steps = recipe.steps;
  const {
    session,
    now,
    markCurrentStepDone,
    toggleStep,
    toggleIngredient,
    toggleTimerById,
    addMinuteById,
  } = useCookSession(recipe.id, steps);

  // Keeps the screen on while cooking (web only for now; see lib/cook/keepAwake.ts).
  useEffect(() => keepScreenAwake(), []);

  const nowIndex = currentStepIndex(session, steps.length);
  const ingredientsReady = session.checkedIngredients.length;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center border-b border-border bg-card px-3 py-2">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={COOK_COPY.closeAccessibility}
          className="p-2"
        >
          <Ionicons name="close" size={24} color={THEME.ink} />
        </Pressable>
        <View className="flex-1 px-1">
          <Text className="text-base font-bold text-ink" numberOfLines={1}>
            {recipe.name}
          </Text>
          <Text className="text-xs font-semibold text-primary">{COOK_COPY.headerSubtitle}</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom, gap: 22 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="rounded-3xl bg-primary p-5">
          {steps.length === 0 ? (
            <Text className="text-base font-semibold leading-6 text-on-primary">{COOK_COPY.noSteps}</Text>
          ) : nowIndex >= 0 ? (
            <>
              <Text className="text-xs font-semibold text-on-primary-muted">
                {COOK_COPY.upNext(nowIndex + 1, steps.length)}
              </Text>
              <Text className="mt-2 text-xl font-bold leading-7 text-on-primary">{steps[nowIndex]}</Text>
              <Pressable
                onPress={markCurrentStepDone}
                accessibilityRole="button"
                accessibilityLabel={COOK_COPY.markStepDone}
                className="mt-4 min-h-[52px] items-center justify-center rounded-2xl bg-card"
              >
                <Text className="text-base font-bold text-primary">{COOK_COPY.markStepDone}</Text>
              </Pressable>
            </>
          ) : (
            <Text className="text-xl font-bold leading-7 text-on-primary">{COOK_COPY.allDone}</Text>
          )}
        </View>

        {session.timers.length > 0 ? (
          <View>
            <Text className="text-lg font-bold text-ink">{COOK_COPY.timersTitle}</Text>
            <Text className="mt-1 text-xs leading-5 text-muted">{COOK_COPY.timersHint}</Text>
            <View className="mt-3 gap-3">
              {session.timers.map((timer) => {
                const status = timerStatus(timer, now);
                const finished = status === 'finished';
                const percent = Math.round(timerProgress(timer, now) * 100);
                return (
                  <View
                    key={timer.id}
                    className={`rounded-2xl border p-4 ${
                      finished ? 'border-tomato bg-tomato-light' : 'border-border bg-card'
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Text className="text-sm font-bold text-ink">
                          {COOK_COPY.timerStep(timer.stepIndex + 1, timer.label)}
                        </Text>
                        <Text className="text-xs text-muted">{statusText(status)}</Text>
                      </View>
                      <Text className="text-3xl font-bold text-ink">
                        {formatClock(timerRemainingSec(timer, now))}
                      </Text>
                    </View>

                    <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                      <View className="h-1.5 rounded-full bg-primary" style={{ width: `${percent}%` as `${number}%` }} />
                    </View>

                    {finished ? (
                      <Text className="mt-3 text-sm font-bold text-tomato-dark">
                        {COOK_COPY.timesUp(timer.stepIndex + 1)}
                      </Text>
                    ) : null}

                    <View className="mt-3 flex-row gap-2">
                      <Pressable
                        onPress={() => toggleTimerById(timer.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${startButtonText(status)} timer for step ${timer.stepIndex + 1}`}
                        className="min-h-[44px] flex-1 items-center justify-center rounded-full bg-primary"
                      >
                        <Text className="text-sm font-bold text-on-primary">{startButtonText(status)}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => addMinuteById(timer.id)}
                        accessibilityRole="button"
                        accessibilityLabel={COOK_COPY.timerAddMinuteAccessibility}
                        className="min-h-[44px] items-center justify-center rounded-full border border-border bg-card px-5"
                      >
                        <Text className="text-sm font-semibold text-primary">{COOK_COPY.timerAddMinute}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {steps.length > 0 ? (
          <View>
            <Text className="text-lg font-bold text-ink">{COOK_COPY.stepsTitle}</Text>
            <View className="mt-3 gap-2">
              {steps.map((text, index) => {
                const done = session.doneSteps.includes(index);
                const isNow = index === nowIndex;
                const timer = session.timers.find((t) => t.stepIndex === index);
                return (
                  <Pressable
                    key={`${index}-${text.slice(0, 24)}`}
                    onPress={() => toggleStep(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Step ${index + 1}${done ? ', done' : ''}`}
                    accessibilityState={{ selected: done }}
                    className={`min-h-[56px] flex-row items-center gap-3 rounded-2xl border px-3.5 py-2.5 ${
                      isNow ? 'border-primary bg-primary-light' : 'border-border bg-card'
                    }`}
                  >
                    <View
                      className={`h-7 w-7 items-center justify-center rounded-full border-2 ${
                        done ? 'border-primary bg-primary' : isNow ? 'border-primary bg-card' : 'border-border'
                      }`}
                    >
                      {done ? <Ionicons name="checkmark" size={16} color={THEME.onPrimary} /> : null}
                    </View>
                    <Text
                      className={`flex-1 text-sm leading-5 ${
                        done ? 'text-muted line-through' : isNow ? 'font-bold text-ink' : 'text-ink'
                      }`}
                    >
                      {text}
                    </Text>
                    {timer && !done ? (
                      <View className="rounded-full bg-sand px-2.5 py-1">
                        <Text className="text-xs font-bold text-ink">{timer.label}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {recipe.ingredients.length > 0 ? (
          <View>
            <View className="flex-row items-baseline justify-between">
              <Text className="text-lg font-bold text-ink">{COOK_COPY.ingredientsTitle}</Text>
              <Text className="text-xs font-semibold text-muted">
                {COOK_COPY.ingredientsReady(ingredientsReady, recipe.ingredients.length)}
              </Text>
            </View>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {recipe.ingredients.map((ing, index) => {
                const checked = session.checkedIngredients.includes(index);
                const text = formatIngredientAmount(ing.quantity, ing.unit, ing.name);
                return (
                  <Pressable
                    key={`${ing.ingredientId}-${index}`}
                    onPress={() => toggleIngredient(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`${text}${checked ? ', ready' : ''}`}
                    accessibilityState={{ selected: checked }}
                    className={`min-h-[44px] justify-center rounded-full border px-4 ${
                      checked ? 'border-primary bg-primary-light' : 'border-border bg-card'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        checked ? 'text-primary line-through' : 'text-ink'
                      }`}
                    >
                      {text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
