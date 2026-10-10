import { Pressable, ScrollView, Text, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import { useCallback, useMemo, useState } from 'react';
import type { RecipesTabRow } from '../../config/recipesTabFilters';
import {
  type ForkInRoadMood,
  type ForkInRoadPantryPref,
  type ForkInRoadProtein,
  type ForkInRoadQuizAnswers,
  forkInRoadRecipeMinutes,
  pickForkInRoadRecipes,
} from '../../lib/forkinator/forkInRoadQuiz';

type QuizStep = 0 | 1 | 2 | 'results';

const MOOD_OPTIONS: { id: ForkInRoadMood; label: string }[] = [
  { id: 'fast', label: 'Fast' },
  { id: 'fancy', label: 'Fancy' },
  { id: 'comfort', label: 'Comfort Food' },
];

const PANTRY_OPTIONS: { id: ForkInRoadPantryPref; label: string }[] = [
  { id: 'use_pantry', label: 'Yes, use my stuff' },
  { id: 'dont_care', label: "Don't care" },
];

const PROTEIN_OPTIONS: { id: ForkInRoadProtein; label: string }[] = [
  { id: 'chicken', label: 'Chicken' },
  { id: 'beef', label: 'Beef' },
  { id: 'pork', label: 'Pork' },
  { id: 'seafood', label: 'Seafood' },
  { id: 'veggie', label: 'Veggie' },
  { id: 'surprise', label: 'Surprise me' },
];

type Props = {
  visible: boolean;
  candidateRows: readonly RecipesTabRow[];
  onClose: () => void;
  onOpenRecipe: (row: RecipesTabRow) => void;
};

function ChoiceButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="mb-2 rounded-xl border border-border bg-paper px-4 py-3"
    >
      <Text className="text-center text-base font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

export function ForkInRoadQuizSheet({ visible, candidateRows, onClose, onOpenRecipe }: Props) {
  const [step, setStep] = useState<QuizStep>(0);
  const [mood, setMood] = useState<ForkInRoadMood | null>(null);
  const [pantry, setPantry] = useState<ForkInRoadPantryPref | null>(null);
  const [protein, setProtein] = useState<ForkInRoadProtein | null>(null);

  const reset = useCallback(() => {
    setStep(0);
    setMood(null);
    setPantry(null);
    setProtein(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const answers = useMemo((): ForkInRoadQuizAnswers | null => {
    if (!mood || !pantry || !protein) return null;
    return { mood, pantry, protein };
  }, [mood, pantry, protein]);

  const picks = useMemo(() => {
    if (!answers) return [];
    return pickForkInRoadRecipes(candidateRows, answers, 3);
  }, [answers, candidateRows]);

  if (!visible) return null;

  const question =
    step === 0
      ? 'Fast, Fancy, or Comfort Food?'
      : step === 1
        ? "Use what's in your pantry?"
        : step === 2
          ? 'What sounds good?'
          : null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={close}>
      <Pressable className="flex-1 justify-end bg-black/45" onPress={close}>
        <Pressable
          className="max-h-[85%] rounded-t-3xl border border-border bg-paper px-4 pb-6 pt-4"
          onPress={(event) => event.stopPropagation()}
        >
          <Text className="text-lg font-bold text-ink">Fork in the road</Text>
          {question ? (
            <Text className="mt-2 text-base text-ink">{question}</Text>
          ) : (
            <Text className="mt-2 text-base text-ink">Here are a few ideas</Text>
          )}

          <ScrollView className="mt-4 max-h-96">
            {step === 0
              ? MOOD_OPTIONS.map((opt) => (
                  <ChoiceButton
                    key={opt.id}
                    label={opt.label}
                    onPress={() => {
                      setMood(opt.id);
                      setStep(1);
                    }}
                  />
                ))
              : null}
            {step === 1
              ? PANTRY_OPTIONS.map((opt) => (
                  <ChoiceButton
                    key={opt.id}
                    label={opt.label}
                    onPress={() => {
                      setPantry(opt.id);
                      setStep(2);
                    }}
                  />
                ))
              : null}
            {step === 2
              ? PROTEIN_OPTIONS.map((opt) => (
                  <ChoiceButton
                    key={opt.id}
                    label={opt.label}
                    onPress={() => {
                      setProtein(opt.id);
                      setStep('results');
                    }}
                  />
                ))
              : null}
            {step === 'results' ? (
              <>
                {picks.length === 0 ? (
                  <Text className="py-4 text-sm text-muted">
                    No recipes matched — try again with different answers.
                  </Text>
                ) : (
                  picks.map((row) => (
                    <Pressable
                      key={row.kind === 'kitchen' ? row.recipe.id : `pick-${row.recipe.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${row.recipe.name}`}
                      onPress={() => {
                        close();
                        onOpenRecipe(row);
                      }}
                      className="mb-2 rounded-xl border border-border bg-cream px-4 py-3"
                    >
                      <Text className="text-base font-semibold text-ink">{row.recipe.name}</Text>
                      <Text className="mt-1 text-xs text-muted">
                        {forkInRoadRecipeMinutes(row)} min
                        {row.match.missingCount === 0 ? ' · pantry ready' : ` · ${row.match.missingCount} to buy`}
                      </Text>
                    </Pressable>
                  ))
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  onPress={reset}
                  className="mt-2 rounded-xl border border-dashed border-border px-4 py-3"
                >
                  <Text className="text-center text-sm font-semibold text-primary">Try again</Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close quiz"
            onPress={close}
            className="mt-4 rounded-xl px-4 py-2"
          >
            <Text className="text-center text-sm text-muted">Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
