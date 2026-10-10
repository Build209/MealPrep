import { Ionicons } from '../lib/icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Modal } from './BackAwareModal';
import { THEME } from '../config/appConfig';
import {
  countRecipesTabFilterOption,
  RECIPES_TAB_DIFFICULTY_CHOICES,
  RECIPES_TAB_FILTER_COPY,
  RECIPES_TAB_MEAL_CHOICES,
  RECIPES_TAB_SHOP_CHOICES,
  RECIPES_TAB_TIME_CHOICES,
  type RecipesTabDifficultyChoice,
  type RecipesTabFilterDimension,
  type RecipesTabFilterState,
  type RecipesTabMealChoice,
  type RecipesTabRow,
  type RecipesTabShopChoice,
  type RecipesTabTimeChoice,
  recipesTabFilterSummary,
  recipesTabFiltersActive,
} from '../config/recipesTabFilters';

interface RecipesTabFilterBarProps {
  baseRows: RecipesTabRow[];
  filters: RecipesTabFilterState;
  onSetFilter: <K extends RecipesTabFilterDimension>(
    dimension: K,
    value: RecipesTabFilterState[K],
  ) => void;
  onClearAll: () => void;
}

function optionLabel(
  dimension: RecipesTabFilterDimension,
  value: string,
): string {
  if (value === 'any') return RECIPES_TAB_FILTER_COPY.options.any;
  switch (dimension) {
    case 'time':
      return RECIPES_TAB_FILTER_COPY.options.time[value as Exclude<RecipesTabTimeChoice, 'any'>];
    case 'difficulty':
      return RECIPES_TAB_FILTER_COPY.options.difficulty[
        value as Exclude<RecipesTabDifficultyChoice, 'any'>
      ];
    case 'meal':
      return RECIPES_TAB_FILTER_COPY.options.meal[value as Exclude<RecipesTabMealChoice, 'any'>];
    case 'shop':
      return RECIPES_TAB_FILTER_COPY.options.shop[value as Exclude<RecipesTabShopChoice, 'any'>];
    default:
      return value;
  }
}

function choicesForDimension(dimension: RecipesTabFilterDimension): string[] {
  switch (dimension) {
    case 'time':
      return RECIPES_TAB_TIME_CHOICES;
    case 'difficulty':
      return RECIPES_TAB_DIFFICULTY_CHOICES;
    case 'meal':
      return RECIPES_TAB_MEAL_CHOICES;
    case 'shop':
      return RECIPES_TAB_SHOP_CHOICES;
    default:
      return ['any'];
  }
}

function FilterQuestion({
  question,
  dimension,
  value,
  baseRows,
  filters,
  open,
  onToggleOpen,
  onSelect,
}: {
  question: string;
  dimension: RecipesTabFilterDimension;
  value: string;
  baseRows: RecipesTabRow[];
  filters: RecipesTabFilterState;
  open: boolean;
  onToggleOpen: () => void;
  onSelect: (next: string) => void;
}) {
  const choices = choicesForDimension(dimension);

  return (
    <View className="mb-4" style={{ zIndex: open ? 20 : 1 }}>
      <Text className="mb-1 text-sm font-semibold text-ink">{question}</Text>
      <Pressable
        onPress={onToggleOpen}
        accessibilityRole="button"
        accessibilityLabel={`${question} select`}
        accessibilityState={{ expanded: open }}
        className="min-h-[44px] flex-row items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5"
      >
        <Text className="text-sm text-ink">{optionLabel(dimension, value)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={THEME.muted} />
      </Pressable>
      {open ? (
        <View className="mt-1 overflow-visible rounded-xl border border-border bg-paper">
          {choices.map((choice) => {
            const count = countRecipesTabFilterOption(
              baseRows,
              filters,
              dimension,
              choice as RecipesTabFilterState[typeof dimension],
            );
            const disabled = count === 0 && choice !== value;
            const selected = choice === value;
            const label = optionLabel(dimension, choice);
            return (
              <Pressable
                key={choice}
                disabled={disabled}
                onPress={() => onSelect(choice)}
                accessibilityRole="button"
                accessibilityLabel={`${question} option ${label}`}
                accessibilityState={{ selected, disabled }}
                className={`min-h-[44px] justify-center border-b border-border px-3 py-2.5 ${disabled ? 'opacity-40' : ''}`}
              >
                <Text
                  className={`text-sm ${selected ? 'font-bold text-primary' : 'text-ink'}`}
                >
                  {label}
                  {choice !== 'any' ? ` (${count})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function RecipesTabFilterBar({
  baseRows,
  filters,
  onSetFilter,
  onClearAll,
}: RecipesTabFilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openDimension, setOpenDimension] = useState<RecipesTabFilterDimension | null>(null);
  const active = recipesTabFiltersActive(filters);

  const closeSheet = () => {
    setSheetOpen(false);
    setOpenDimension(null);
  };

  const toggleDimension = (dimension: RecipesTabFilterDimension) => {
    setOpenDimension((prev) => (prev === dimension ? null : dimension));
  };

  const selectDimension = <K extends RecipesTabFilterDimension>(
    dimension: K,
    next: RecipesTabFilterState[K],
  ) => {
    onSetFilter(dimension, next);
    setOpenDimension(null);
  };
  const summary = useMemo(() => recipesTabFilterSummary(filters), [filters]);

  return (
    <>
      <View className="mt-3 flex-row items-center">
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={RECIPES_TAB_FILTER_COPY.filterButton}
          className="min-h-[44px] flex-1 flex-row items-center rounded-full border border-border bg-card px-4 py-1"
        >
          <Ionicons name="options-outline" size={18} color={THEME.muted} />
          <View className="ml-2 flex-1">
            <Text className="text-sm font-semibold text-ink">{RECIPES_TAB_FILTER_COPY.filterButton}</Text>
            {active && summary ? (
              <Text className="text-[11px] text-muted" numberOfLines={1}>
                {summary}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {active ? (
          <Pressable onPress={onClearAll} className="ml-1 min-h-[44px] justify-center px-3">
            <Text className="text-sm font-bold text-primary">{RECIPES_TAB_FILTER_COPY.clear}</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={sheetOpen} animationType="slide" transparent onRequestClose={closeSheet}>
        <View className="flex-1 justify-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss filter sheet"
            className="absolute inset-0 bg-black/40"
            onPress={closeSheet}
          />
          <View className="max-h-[80%] rounded-t-3xl bg-paper px-4 pb-8 pt-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-base font-bold text-ink">{RECIPES_TAB_FILTER_COPY.filterButton}</Text>
              <Pressable
                onPress={closeSheet}
                accessibilityRole="button"
                accessibilityLabel="Close filters"
                hitSlop={12}
              >
                <Ionicons name="close" size={22} color={THEME.muted} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              contentContainerStyle={{ overflow: 'visible' }}
              style={{ overflow: 'visible' }}
            >
              <FilterQuestion
                question={RECIPES_TAB_FILTER_COPY.questions.time}
                dimension="time"
                value={filters.time}
                baseRows={baseRows}
                filters={filters}
                open={openDimension === 'time'}
                onToggleOpen={() => toggleDimension('time')}
                onSelect={(next) => selectDimension('time', next as RecipesTabTimeChoice)}
              />
              <FilterQuestion
                question={RECIPES_TAB_FILTER_COPY.questions.shop}
                dimension="shop"
                value={filters.shop}
                baseRows={baseRows}
                filters={filters}
                open={openDimension === 'shop'}
                onToggleOpen={() => toggleDimension('shop')}
                onSelect={(next) => selectDimension('shop', next as RecipesTabShopChoice)}
              />
              <FilterQuestion
                question={RECIPES_TAB_FILTER_COPY.questions.difficulty}
                dimension="difficulty"
                value={filters.difficulty}
                baseRows={baseRows}
                filters={filters}
                open={openDimension === 'difficulty'}
                onToggleOpen={() => toggleDimension('difficulty')}
                onSelect={(next) => selectDimension('difficulty', next as RecipesTabDifficultyChoice)}
              />
              <FilterQuestion
                question={RECIPES_TAB_FILTER_COPY.questions.meal}
                dimension="meal"
                value={filters.meal}
                baseRows={baseRows}
                filters={filters}
                open={openDimension === 'meal'}
                onToggleOpen={() => toggleDimension('meal')}
                onSelect={(next) => selectDimension('meal', next as RecipesTabMealChoice)}
              />
              {active ? (
                <Pressable
                  onPress={() => {
                    onClearAll();
                    closeSheet();
                  }}
                  className="mt-2 min-h-[44px] items-center justify-center rounded-full border border-border py-3"
                >
                  <Text className="text-sm font-bold text-ink">{RECIPES_TAB_FILTER_COPY.clearFilters}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function RecipesTabFiltersEmptyState({ onClearAll }: { onClearAll: () => void }) {
  return (
    <View className="mt-4 items-center rounded-[18px] border border-dashed border-border bg-card px-5 py-8">
      <Text className="text-center text-base font-bold text-ink">{RECIPES_TAB_FILTER_COPY.emptyTitle}</Text>
      <Text className="mt-2 text-center text-sm text-muted">{RECIPES_TAB_FILTER_COPY.emptyBody}</Text>
      <Pressable onPress={onClearAll} className="mt-4 min-h-[44px] items-center justify-center rounded-full bg-primary px-5">
        <Text className="text-sm font-bold text-on-primary">{RECIPES_TAB_FILTER_COPY.clearFilters}</Text>
      </Pressable>
    </View>
  );
}
