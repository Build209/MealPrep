import { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { recipeConflictsWithDietPrefs, recipeDietTagFromIngredientLines } from '../../lib/diet/conflicts';
import { recipeDietSummaryForPrefs } from '../../lib/diet/summaryLine';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Linking,
} from 'react-native';
import { Modal } from '../BackAwareModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RECIPE_IMPORT_COPY } from '../../config/recipeImport';
import type { RecipeImportExtractedDto } from '../../lib/recipeImport/types';
import { formatIngredientAmount } from '../../lib/formatQuantity';
import { importDtoWithoutSourceAttribution } from '../../lib/recipeImport/clearRecipeSource';
import { sourceCreditFromImportDto } from '../../lib/recipeImport/sourceCredit';
import { RecipeSourceCreditLine } from './RecipeSourceCreditLine';

interface RecipeImportReviewSheetProps {
  visible: boolean;
  draft: RecipeImportExtractedDto | null;
  onClose: () => void;
  onSave: (recipe: RecipeImportExtractedDto) => Promise<{ id: string } | void>;
  onAddMissingToGrocery?: (recipeId: string) => void;
}

function RecipeImportReviewForm({
  draft,
  onClose,
  onSave,
  onAddMissingToGrocery,
}: {
  draft: RecipeImportExtractedDto;
  onClose: () => void;
  onSave: (recipe: RecipeImportExtractedDto) => Promise<{ id: string } | void>;
  onAddMissingToGrocery?: (recipeId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { userDietPrefs } = useApp();
  const [title, setTitle] = useState(draft.title);
  const [stepsText, setStepsText] = useState(draft.steps.join('\n'));
  const [ingredientsText, setIngredientsText] = useState(
    draft.ingredients
      .map((ing) => {
        const line = formatIngredientAmount(ing.quantity, ing.unit, ing.name);
        return ing.note ? `${line} (${ing.note})` : line;
      })
      .join('\n'),
  );
  const [saving, setSaving] = useState(false);
  const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
  const [sourceRemoved, setSourceRemoved] = useState(false);
  const effectiveDraft = sourceRemoved ? importDtoWithoutSourceAttribution(draft) : draft;

  const importDietWarning = useMemo(() => {
    const lines = ingredientsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return null;
    const tag = recipeDietTagFromIngredientLines(lines, userDietPrefs);
    if (!recipeConflictsWithDietPrefs(userDietPrefs, tag, lines)) return null;
    const summary = recipeDietSummaryForPrefs(userDietPrefs, tag, lines);
    return summary ?? 'This recipe may not match your diet settings.';
  }, [ingredientsText, userDietPrefs]);

  async function handleSave() {
    setSaving(true);
    try {
      const steps = stepsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const ingredients = ingredientsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const match = line.match(/^([\d./]+)\s+(\S+)\s+(.+)$/);
          if (!match) {
            return { name: line, quantity: 1, unit: 'each' };
          }
          const quantity = Number.parseFloat(match[1]) || 1;
          return { name: match[3], quantity, unit: match[2] };
        });

      const next: RecipeImportExtractedDto = {
        ...effectiveDraft,
        title: title.trim() || draft.title,
        steps,
        ingredients: ingredients.length > 0 ? ingredients : draft.ingredients,
      };
      const saved = await onSave(next);
      if (next.source_type === 'photo' && onAddMissingToGrocery && saved && 'id' in saved) {
        setSavedRecipeId(saved.id);
        return;
      }
    } finally {
      setSaving(false);
    }
  }

  if (savedRecipeId && onAddMissingToGrocery) {
    return (
      <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center border-b border-border bg-card px-4 py-3">
          <Pressable onPress={onClose} accessibilityLabel="Close" className="mr-3 p-1">
            <Text className="text-base font-bold text-primary">{RECIPE_IMPORT_COPY.cancel}</Text>
          </Pressable>
          <Text className="flex-1 text-lg font-bold text-ink">Recipe saved</Text>
        </View>
        <View className="flex-1 px-4 pt-6">
          <Text className="text-sm text-muted">Add ingredients you do not already have in your pantry.</Text>
          <Pressable
            onPress={() => {
              onAddMissingToGrocery(savedRecipeId);
              onClose();
            }}
            className="mt-4 items-center rounded-full bg-primary py-4"
          >
            <Text className="text-base font-bold text-on-primary">{RECIPE_IMPORT_COPY.addMissingGroceryCta}</Text>
          </Pressable>
          <Pressable onPress={onClose} className="mt-3 items-center py-3">
            <Text className="text-sm font-semibold text-muted">Not now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center border-b border-border bg-card px-4 py-3">
        <Pressable onPress={onClose} accessibilityLabel="Close import review" className="mr-3 p-1">
          <Text className="text-base font-bold text-primary">{RECIPE_IMPORT_COPY.cancel}</Text>
        </Pressable>
        <Text className="flex-1 text-lg font-bold text-ink">{RECIPE_IMPORT_COPY.reviewTitle}</Text>
      </View>
      <ScrollView className="flex-1 px-4 pb-10" keyboardShouldPersistTaps="handled">
        <Text className="mt-3 text-sm text-muted">{RECIPE_IMPORT_COPY.reviewSubtitle}</Text>
        {importDietWarning ? (
          <View className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2">
            <Text className="text-sm font-semibold text-danger">{importDietWarning}</Text>
            <Text className="mt-1 text-xs text-muted">Check labels — estimate only.</Text>
          </View>
        ) : null}
        {!sourceRemoved && (effectiveDraft.source_type === 'reddit' || effectiveDraft.social_author_name) ? (
          <>
            <RecipeSourceCreditLine {...sourceCreditFromImportDto(effectiveDraft)} />
            {effectiveDraft.source_type === 'reddit' ? (
              <Pressable
                onPress={() => setSourceRemoved(true)}
                className="mt-1 self-start"
                accessibilityRole="button"
                accessibilityLabel={RECIPE_IMPORT_COPY.removeSourceAccessibility}
              >
                <Text className="text-xs font-semibold text-muted">{RECIPE_IMPORT_COPY.removeSourceCta}</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
        {draft.author_public_recipe_url ? (
          <Pressable
            onPress={() => void Linking.openURL(draft.author_public_recipe_url!)}
            className="mt-2 self-start"
          >
            <Text className="text-xs font-semibold text-primary">{RECIPE_IMPORT_COPY.seeAuthorVersion}</Text>
          </Pressable>
        ) : null}
        <Text className="mt-4 text-xs font-semibold uppercase text-muted">Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          className="mt-1 rounded-xl border border-border bg-card px-3 py-2 text-base text-ink"
        />
        <Text className="mt-4 text-xs font-semibold uppercase text-muted">Ingredients (one per line)</Text>
        <TextInput
          value={ingredientsText}
          onChangeText={setIngredientsText}
          multiline
          className="mt-1 min-h-[120px] rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
        />
        <Text className="mt-4 text-xs font-semibold uppercase text-muted">Steps (one per line)</Text>
        <TextInput
          value={stepsText}
          onChangeText={setStepsText}
          multiline
          className="mt-1 min-h-[160px] rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
        />
        <Pressable
          onPress={() => void handleSave()}
          disabled={saving}
          className="mt-6 items-center rounded-full bg-primary py-4"
        >
          <Text className="text-base font-bold text-on-primary">
            {saving ? RECIPE_IMPORT_COPY.saving : RECIPE_IMPORT_COPY.saveCta}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export function RecipeImportReviewSheet({
  visible,
  draft,
  onClose,
  onSave,
  onAddMissingToGrocery,
}: RecipeImportReviewSheetProps) {
  if (!draft) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <RecipeImportReviewForm
        key={draft.source_url}
        draft={draft}
        onClose={onClose}
        onSave={onSave}
        onAddMissingToGrocery={onAddMissingToGrocery}
      />
    </Modal>
  );
}
