import { useCallback } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons/Ionicons';
import { THEME } from '../../config/appConfig';
import { DIET_PREF_COPY } from '../../config/diet';
import { HOME_HUB_COPY, type HomeHubSection } from '../../config/homeHub';
import { SAVED_RECIPES_COPY } from '../../config/savedRecipes';
import type { RecipesTabRow } from '../../config/recipesTabFilters';
import { recipeDietTagFromIngredientLines } from '../../lib/diet/conflicts';
import { dietCheckLinesFromRecipesTabRow } from '../../lib/diet/ingredientLines';
import { recipeDietSummaryForPrefs } from '../../lib/diet/summaryLine';
import type { UserDietPrefs } from '../../lib/diet/types';
import { kitchenRowFailsDietPrefs } from '../../lib/mealdb/resolveKitchenRowDetails';
import { MealWeekCalendarCard } from '../mealCalendar/MealWeekCalendarCard';
import { CookConfirmBanner } from './CookConfirmBanner';
import { RecipesUnifiedFeedCard } from '../recipes/RecipesUnifiedFeedCard';
import { useApp } from '../../context/AppContext';
import { savedCreatorItemFromRecord } from '../../lib/savedRecipes/resolveRows';
import { useHomeHubSheet } from '../../context/HomeHubSheetContext';
import { UndoToastModalHost } from '../UndoToastHosts';

function hubRowDietAccessibilityWarning(
  row: RecipesTabRow,
  prefs: UserDietPrefs,
): string | null {
  if (!kitchenRowFailsDietPrefs(row, prefs)) return null;
  const lines = dietCheckLinesFromRecipesTabRow(row) ?? [];
  const tag = recipeDietTagFromIngredientLines(lines, prefs);
  return (
    recipeDietSummaryForPrefs(prefs, tag, lines) ?? DIET_PREF_COPY.hiddenForAllergySettingsToast
  );
}

function HubSegment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      {...(Platform.OS === 'web' ? { 'aria-selected': active } : {})}
      className={`flex-1 items-center rounded-full px-2 py-2.5 ${active ? 'bg-primary' : 'bg-paper'}`}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      <Text className={`text-sm font-bold ${active ? 'text-on-primary' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

export function HomeHubSheet({
  rows,
  guestHint,
  onOpenRow,
}: {
  rows: RecipesTabRow[];
  guestHint?: boolean;
  onOpenRow: (row: RecipesTabRow) => void;
}) {
  const insets = useSafeAreaInsets();
  const { visible, section, closeHub, setSection } = useHomeHubSheet();
  const {
    cookConfirmPrompt,
    confirmCookConfirmPrompt,
    declineCookConfirmPrompt,
    dismissCookConfirmPrompt,
    cookConfirmBusy,
    savedRecipes,
    userDietPrefs,
  } = useApp();

  const setHubSection = (next: HomeHubSection) => setSection(next);

  const toggleHubRowSave = useCallback(
    (row: RecipesTabRow) => {
      if (row.kind !== 'kitchen') return;
      if (row.recipe.id.startsWith('viral-preview-')) {
        const record = savedRecipes.records.find((entry) => {
          const item = savedCreatorItemFromRecord(entry);
          return item?.videoId && row.recipe.id === `viral-preview-${item.videoId}`;
        });
        const item = record ? savedCreatorItemFromRecord(record) : null;
        if (item) {
          savedRecipes.toggleViralItem(item, null);
        }
        return;
      }
      savedRecipes.toggleKitchenRecipe(row.recipe);
    },
    [savedRecipes],
  );

  const hubRowSaved = useCallback(
    (row: RecipesTabRow) => {
      if (row.kind !== 'kitchen') return false;
      if (row.recipe.id.startsWith('viral-preview-')) {
        const videoId = row.recipe.id.slice('viral-preview-'.length);
        return savedRecipes.isCreatorSaved(videoId, null);
      }
      return savedRecipes.isKitchenSaved(row.recipe);
    },
    [savedRecipes],
  );

  const hubRowSavePending = useCallback(
    (row: RecipesTabRow) => {
      if (row.kind !== 'kitchen') return false;
      if (row.recipe.id.startsWith('viral-preview-')) {
        const videoId = row.recipe.id.slice('viral-preview-'.length);
        return savedRecipes.isCreatorSavePending(videoId, null);
      }
      return savedRecipes.isKitchenSavePending(row.recipe);
    },
    [savedRecipes],
  );

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={closeHub}>
      <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center border-b border-border bg-card px-3 py-2">
          <Pressable
            onPress={closeHub}
            accessibilityLabel="Close"
            className="p-2"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Ionicons name="close" size={22} color={THEME.ink} />
          </Pressable>
          <Text className="flex-1 text-center text-sm font-semibold text-ink">
            {section === 'myRecipes' ? SAVED_RECIPES_COPY.myRecipesTitle : HOME_HUB_COPY.segmentWeekPlan}
          </Text>
          <View className="w-10" />
        </View>

        <View
          className="flex-row gap-2 border-b border-border bg-card px-3 py-2"
          accessibilityRole="tablist"
        >
          <HubSegment
            label={HOME_HUB_COPY.segmentMyRecipes}
            active={section === 'myRecipes'}
            onPress={() => setHubSection('myRecipes')}
          />
          <HubSegment
            label={HOME_HUB_COPY.segmentWeekPlan}
            active={section === 'weekPlan'}
            onPress={() => setHubSection('weekPlan')}
          />
        </View>

        {section === 'myRecipes' ? (
          <>
            {guestHint ? (
              <Text className="px-4 py-2 text-xs text-muted">{SAVED_RECIPES_COPY.guestHint}</Text>
            ) : null}
            <ScrollView className="flex-1 px-4 pb-8 pt-2" keyboardShouldPersistTaps="handled">
              {rows.length === 0 ? (
                <Text className="mt-4 text-sm text-muted">{SAVED_RECIPES_COPY.empty}</Text>
              ) : (
                rows.map((row) => (
                  <RecipesUnifiedFeedCard
                    key={row.kind === 'kitchen' ? row.recipe.id : `api-${row.recipe.id}`}
                    row={row}
                    saved={hubRowSaved(row)}
                    onToggleSave={row.kind === 'kitchen' ? () => toggleHubRowSave(row) : undefined}
                    saveDisabled={hubRowSavePending(row)}
                    accessibilityDietWarning={hubRowDietAccessibilityWarning(row, userDietPrefs)}
                    onOpen={() => {
                      closeHub();
                      onOpenRow(row);
                    }}
                  />
                ))
              )}
            </ScrollView>
          </>
        ) : (
          <ScrollView className="flex-1 px-4 pb-8" contentContainerStyle={{ paddingBottom: 24 }}>
            {cookConfirmPrompt ? (
              <CookConfirmBanner
                title={cookConfirmPrompt.title}
                busy={cookConfirmBusy}
                onYes={() => void confirmCookConfirmPrompt()}
                onNotThisTime={declineCookConfirmPrompt}
                onDismiss={dismissCookConfirmPrompt}
              />
            ) : null}
            <MealWeekCalendarCard />
          </ScrollView>
        )}
        <UndoToastModalHost />
      </View>
    </Modal>
  );
}
