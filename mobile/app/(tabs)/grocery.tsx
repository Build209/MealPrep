import { Ionicons } from '../../lib/icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Modal } from '../../components/BackAwareModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { GroceryEmptyState } from '../../components/grocery/GroceryEmptyState';
import { GroceryItemSwipeRow } from '../../components/grocery/GroceryItemSwipeRow';
import { UsualItemsCard } from '../../components/grocery/UsualItemsCard';
import { CATEGORY_LABELS, THEME } from '../../config/appConfig';
import { APP_ROUTES } from '../../config/appRoutes';
import { GROCERY_COPY } from '../../config/grocery';
import { useApp } from '../../context/AppContext';
import { useTutorialTarget } from '../../hooks/useTutorial';
import { groupGroceryByAisle } from '../../lib/grocery';
import { inferGroceryCategoryFromName } from '../../lib/grocery/categorize';
import {
  groupGroceryByDayAndMeal,
  hasMealPlanGroceryGrouping,
  mergeGroceryItemsForCombinedView,
  readGroceryCombinePreference,
  writeGroceryCombinePreference,
} from '../../lib/grocery/grouping';
import {
  consumeGroceryAisleCombineRequest,
  subscribeGroceryAisleCombineRequest,
} from '../../lib/grocery/groceryCombineRequest';
import { markForkinatorAisleSortUsed } from '../../lib/forkinator/aisleSortPrompt';
import { localDateString } from '../../lib/mealCalendar/dates';
import { countUpcomingScheduledMeals } from '../../lib/mealCalendar/groupMeals';
import { MEAL_CALENDAR } from '../../config/mealCalendar';
import { useGroceryCommunityDealBadges } from '../../lib/communityDeals/useCommunityDeals';
import { buildGroceryRecipeNameById, groceryRecipeSourceLabels } from '../../lib/grocery/recipeLabels';
import { PANTRY_CATEGORIES, type PantryCategory } from '../../types/mealprep';

/** Approved design: small caps aisle heading above a white card of hairline-separated rows. */
const SECTION_HEADING_CLASS = 'text-[13px] font-extrabold uppercase tracking-wider text-muted';
const SECTION_CARD_CLASS = 'mt-2 overflow-hidden rounded-[18px] border border-border bg-card';

export default function GroceryScreen() {
  const {
    grocery,
    feedKitchenRecipes,
    catalogKitchenRecipes,
    recipes,
    savedRecipes,
    pantryRecipeMatches,
    mealPlan,
    session,
    toggleGroceryItem,
    toggleGroceryItemsChecked,
    featureFlags,
    refreshGrocery,
    addManualGroceryItem,
    clearCheckedGroceryItems,
    removeGroceryItem,
    kitchenError,
    clearKitchenError,
  } = useApp();

  const insets = useSafeAreaInsets();
  const [cartExpanded, setCartExpanded] = useState(true);
  // The first-time tour lights up the add-item field.
  const tutorialAddRef = useTutorialTarget('grocery-add');
  const [addOpen, setAddOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualUnit, setManualUnit] = useState('each');
  const [manualCategory, setManualCategory] = useState<PantryCategory>(() => inferGroceryCategoryFromName(''));
  const [aisleTouched, setAisleTouched] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [addError, setAddError] = useState<{ title: string; message: string } | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [combineList, setCombineList] = useState(() => readGroceryCombinePreference());
  const [expandedMealHintKey, setExpandedMealHintKey] = useState<string | null>(null);

  useEffect(() => {
    writeGroceryCombinePreference(combineList);
    if (combineList) {
      markForkinatorAisleSortUsed();
    }
  }, [combineList]);

  useEffect(() => {
    return subscribeGroceryAisleCombineRequest(() => {
      setCombineList(true);
    });
  }, []);

  useEffect(() => {
    if (consumeGroceryAisleCombineRequest()) {
      setCombineList(true);
    }
  }, []);

  const todayIso = localDateString();
  const upcomingPlannedMealCount = useMemo(
    () => countUpcomingScheduledMeals(mealPlan, todayIso, MEAL_CALENDAR.daysAhead),
    [mealPlan, todayIso],
  );

  const showMealGrouping = hasMealPlanGroceryGrouping(mealPlan);
  const useCombinedView = showMealGrouping && combineList;

  const open = useMemo(() => grocery.filter((g) => !g.checked), [grocery]);
  const done = useMemo(() => grocery.filter((g) => g.checked), [grocery]);
  const totalCount = grocery.length;
  const checkedCount = done.length;
  const openSections = useMemo(() => groupGroceryByAisle(open), [open]);
  const openDayGroups = useMemo(
    () => groupGroceryByDayAndMeal(open, mealPlan, todayIso),
    [open, mealPlan],
  );
  const openMerged = useMemo(() => mergeGroceryItemsForCombinedView(open), [open]);
  const doneMerged = useMemo(() => mergeGroceryItemsForCombinedView(done), [done]);
  /** Combined lines are already ordered by aisle; split them so each aisle gets its own card. */
  const openMergedSections = useMemo(() => {
    const sections: { category: PantryCategory; lines: typeof openMerged }[] = [];
    for (const line of openMerged) {
      const last = sections[sections.length - 1];
      if (last && last.category === line.category) {
        last.lines.push(line);
      } else {
        sections.push({ category: line.category, lines: [line] });
      }
    }
    return sections;
  }, [openMerged]);
  const openItemIds = useMemo(() => open.map((g) => g.id), [open]);
  const { badges: communityBadges } = useGroceryCommunityDealBadges(openItemIds, grocery);

  const recipeNameById = useMemo(
    () =>
      buildGroceryRecipeNameById({
        recipes: [...feedKitchenRecipes, ...catalogKitchenRecipes, ...recipes],
        pantryMatches: pantryRecipeMatches,
        savedRecords: savedRecipes.records,
        mealPlan,
        mealPlanRecipes: feedKitchenRecipes,
        ownerId: session?.user?.id ?? '',
      }),
    [
      catalogKitchenRecipes,
      feedKitchenRecipes,
      mealPlan,
      pantryRecipeMatches,
      recipes,
      savedRecipes.records,
      session?.user?.id,
    ],
  );

  const groceryNames = useMemo(() => grocery.map((item) => item.name), [grocery]);

  function recipeLabelFor(item: (typeof grocery)[number]): string {
    return groceryRecipeSourceLabels(item.sourceRecipeIds, recipeNameById);
  }

  function handleClearChecked() {
    if (done.length === 0) return;
    setClearConfirmOpen(true);
  }

  function confirmClearChecked() {
    setClearConfirmOpen(false);
    clearCheckedGroceryItems();
  }

  async function submitManualItem() {
    const qty = Number.parseFloat(manualQty);
    if (!manualName.trim()) {
      setAddError({ title: GROCERY_COPY.nameRequiredTitle, message: GROCERY_COPY.nameRequiredMessage });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setAddError({ title: GROCERY_COPY.quantityTitle, message: GROCERY_COPY.quantityMessage });
      return;
    }
    const inferred = inferGroceryCategoryFromName(manualName);
    setAddSaving(true);
    try {
      await addManualGroceryItem({
        name: manualName,
        quantity: qty,
        unit: manualUnit.trim() || 'each',
        category: aisleTouched ? manualCategory : inferred,
      });
      setManualName('');
      setManualQty('1');
      setManualUnit('each');
      setAisleTouched(false);
      setManualCategory(inferGroceryCategoryFromName(''));
      setAddOpen(false);
    } catch (error) {
      setAddError({
        title: 'Could not add item',
        message: error instanceof Error ? error.message : 'Failed to add grocery item',
      });
    } finally {
      setAddSaving(false);
    }
  }

  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  const showShopCta = featureFlags.smartShop && open.length > 0;
  const shopCtaBottomPad = Math.max(insets.bottom, 16);

  return (
    <>
      <View className="flex-1 bg-paper">
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: showShopCta ? 54 + 12 + shopCtaBottomPad + 24 : 32 }}
        >
          {kitchenError ? (
            <Pressable
              onPress={clearKitchenError}
              className="mt-4 min-h-[44px] flex-row items-center justify-between rounded-[18px] border border-danger/30 bg-danger/10 px-4 py-2"
            >
              <Text className="flex-1 pr-2 text-xs font-medium text-danger">{kitchenError}</Text>
              <Text className="text-xs font-bold text-danger">Dismiss</Text>
            </Pressable>
          ) : null}

          <View className="mt-5 min-h-[44px] flex-row items-center justify-between gap-3">
            <Text
              accessibilityRole="header"
              className="min-w-0 flex-1 text-[28px] font-extrabold leading-[31px] tracking-tight text-ink"
            >
              {GROCERY_COPY.listTitle}
            </Text>
            {showMealGrouping ? (
              <Pressable
                onPress={() => setCombineList((v) => !v)}
                accessibilityRole="switch"
                accessibilityLabel={GROCERY_COPY.sortByAisle}
                accessibilityState={{ checked: combineList }}
                className={`h-11 flex-row items-center justify-center gap-1.5 rounded-full border px-3.5 active:opacity-90 ${
                  combineList ? 'border-primary bg-primary' : 'border-border bg-card'
                }`}
              >
                {combineList ? <Ionicons name="checkmark" size={16} color={THEME.onPrimary} /> : null}
                <Text className={`text-sm font-bold ${combineList ? 'text-on-primary' : 'text-primary'}`}>
                  {GROCERY_COPY.sortByAisle}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            ref={tutorialAddRef}
            onPress={() => {
              setAisleTouched(false);
              setManualCategory(inferGroceryCategoryFromName(manualName));
              setAddOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={GROCERY_COPY.addItemField}
            className="mt-[14px] h-12 flex-row items-center gap-2.5 rounded-full border border-border bg-card px-4 active:opacity-90"
          >
            <Ionicons name="add" size={22} color={THEME.muted} />
            <Text className="min-w-0 flex-1 text-base text-muted" numberOfLines={1}>
              {GROCERY_COPY.addItemField}
            </Text>
          </Pressable>

          <UsualItemsCard groceryNames={groceryNames} onAdd={addManualGroceryItem} />

          <View className="mt-[14px] rounded-[18px] border border-border bg-card px-4 py-3.5">
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-base font-extrabold text-ink">
                  {GROCERY_COPY.toBuyInCartLine(open.length, checkedCount)}
                </Text>
                <Text className="mt-0.5 text-xs text-muted">
                  {GROCERY_COPY.plannedMealsLine(upcomingPlannedMealCount)}
                </Text>
              </View>
              <Pressable
                onPress={refreshGrocery}
                accessibilityRole="button"
                className="h-11 flex-row items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3.5 active:opacity-90"
              >
                <Ionicons name="refresh" size={16} color={THEME.primary} />
                <Text className="text-sm font-bold text-primary">{GROCERY_COPY.refresh}</Text>
              </Pressable>
            </View>
            <View className="mt-3 h-2 overflow-hidden rounded-full bg-primary-light">
              <View className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
            </View>
          </View>

          {totalCount === 0 ? (
            <View className="mt-[14px]">
              <GroceryEmptyState />
            </View>
          ) : (
            <>
              <Text className="mb-1 mt-5 text-lg font-extrabold text-ink">
                {GROCERY_COPY.toBuySection} ({open.length})
              </Text>
              {open.length === 0 ? (
                <View className="mt-2 rounded-[18px] border border-border bg-card px-4 py-5">
                  <Text className="text-center text-sm text-muted">{GROCERY_COPY.allSetHint}</Text>
                </View>
              ) : useCombinedView ? (
                openMergedSections.map((section) => (
                  <View key={section.category} className="mt-[14px]">
                    <Text className={SECTION_HEADING_CLASS}>
                      {CATEGORY_LABELS[section.category]} ({section.lines.length})
                    </Text>
                    <View className={SECTION_CARD_CLASS}>
                      {section.lines.map((line, index) => (
                        <GroceryItemSwipeRow
                          key={line.mergeKey}
                          item={line.representative}
                          quantityLabel={line.quantityLabel}
                          recipeLabels=""
                          hideSecondaryLine
                          mealHint={line.mealHint}
                          showMealHint={expandedMealHintKey === line.mergeKey}
                          onRowBodyPress={() =>
                            setExpandedMealHintKey((key) => (key === line.mergeKey ? null : line.mergeKey))
                          }
                          onToggle={() => toggleGroceryItemsChecked(line.underlyingIds)}
                          onRemove={() => {
                            for (const id of line.underlyingIds) {
                              removeGroceryItem(id);
                            }
                          }}
                          communityDeal={communityBadges.get(line.representative.id)}
                          showDivider={index < section.lines.length - 1}
                        />
                      ))}
                    </View>
                  </View>
                ))
              ) : showMealGrouping ? (
                openDayGroups.map((dayGroup) => (
                  <View key={dayGroup.key} className="mt-[14px]">
                    <Text className="text-[15px] font-extrabold text-ink">{dayGroup.dayLabel}</Text>
                    {dayGroup.meals.map((mealGroup) => (
                      <View key={mealGroup.mealPlanItemId ?? mealGroup.header} className="mt-2.5">
                        <Text className={SECTION_HEADING_CLASS}>{mealGroup.header}</Text>
                        <View className={SECTION_CARD_CLASS}>
                          {mealGroup.items.map((item, index) => (
                            <GroceryItemSwipeRow
                              key={item.id}
                              item={item}
                              recipeLabels=""
                              hideSecondaryLine
                              onToggle={() => toggleGroceryItem(item.id)}
                              onRemove={() => removeGroceryItem(item.id)}
                              communityDeal={communityBadges.get(item.id)}
                              showDivider={index < mealGroup.items.length - 1}
                            />
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                ))
              ) : (
                openSections.map((section) => (
                  <View key={section.category} className="mt-[14px]">
                    <Text className={SECTION_HEADING_CLASS}>
                      {section.label} ({section.items.length})
                    </Text>
                    <View className={SECTION_CARD_CLASS}>
                      {section.items.map((item, index) => (
                        <GroceryItemSwipeRow
                          key={item.id}
                          item={item}
                          recipeLabels={recipeLabelFor(item)}
                          onToggle={() => toggleGroceryItem(item.id)}
                          onRemove={() => removeGroceryItem(item.id)}
                          communityDeal={communityBadges.get(item.id)}
                          showDivider={index < section.items.length - 1}
                        />
                      ))}
                    </View>
                  </View>
                ))
              )}

              {done.length > 0 ? (
                <View className="mt-6">
                  <Pressable
                    onPress={() => setCartExpanded((v) => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: cartExpanded }}
                    className="min-h-[48px] flex-row items-center justify-between rounded-full border border-border bg-card px-4 active:opacity-90"
                  >
                    <View className="flex-row items-center gap-2">
                      <Ionicons name="bag-check-outline" size={20} color={THEME.primary} />
                      <Text className="text-base font-extrabold text-ink">
                        {GROCERY_COPY.inCartSection} ({done.length})
                      </Text>
                    </View>
                    <Ionicons name={cartExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={THEME.muted} />
                  </Pressable>
                  {cartExpanded ? (
                    <View className={SECTION_CARD_CLASS}>
                      {useCombinedView
                        ? doneMerged.map((line, index) => (
                            <GroceryItemSwipeRow
                              key={line.mergeKey}
                              item={{ ...line.representative, checked: true }}
                              quantityLabel={line.quantityLabel}
                              recipeLabels=""
                              hideSecondaryLine
                              mealHint={line.mealHint}
                              showMealHint={expandedMealHintKey === line.mergeKey}
                              onRowBodyPress={() =>
                                setExpandedMealHintKey((key) => (key === line.mergeKey ? null : line.mergeKey))
                              }
                              onToggle={() => toggleGroceryItemsChecked(line.underlyingIds)}
                              onRemove={() => {
                                for (const id of line.underlyingIds) {
                                  removeGroceryItem(id);
                                }
                              }}
                              dimmed
                              showDivider={index < doneMerged.length - 1}
                            />
                          ))
                        : done.map((item, index) => (
                            <GroceryItemSwipeRow
                              key={item.id}
                              item={item}
                              recipeLabels={recipeLabelFor(item)}
                              onToggle={() => toggleGroceryItem(item.id)}
                              onRemove={() => removeGroceryItem(item.id)}
                              dimmed
                              showDivider={index < done.length - 1}
                            />
                          ))}
                    </View>
                  ) : null}
                  <Pressable
                    onPress={handleClearChecked}
                    accessibilityRole="button"
                    className="mt-3 min-h-[48px] items-center justify-center rounded-full border border-danger/30 bg-card px-4 active:opacity-90"
                  >
                    <Text className="text-sm font-bold text-danger">{GROCERY_COPY.clearCheckedItems}</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {showShopCta ? (
          <View
            className="absolute bottom-0 left-0 right-0 bg-paper px-5 pt-3"
            style={{ paddingBottom: shopCtaBottomPad }}
          >
            <Pressable
              // For now this opens the Stores tab (owner, 2026-10-10). It goes back to Smart Shop
              // (APP_ROUTES.smartShop) once live prices are in.
              onPress={() => router.push(APP_ROUTES.stores)}
              accessibilityRole="button"
              accessibilityLabel={GROCERY_COPY.findStoresNearMe}
              className="h-[54px] flex-row items-center justify-center gap-2 rounded-full bg-tomato px-5 active:opacity-90"
            >
              <Ionicons name="location-outline" size={20} color={THEME.onTomato} />
              <Text className="text-[17px] font-extrabold text-on-tomato">{GROCERY_COPY.findStoresNearMe}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ConfirmDialog
        visible={clearConfirmOpen}
        title={GROCERY_COPY.clearCheckedTitle}
        message={GROCERY_COPY.clearCheckedMessage(done.length)}
        confirmLabel={GROCERY_COPY.clear}
        cancelLabel={GROCERY_COPY.cancel}
        destructive
        onConfirm={confirmClearChecked}
        onCancel={() => setClearConfirmOpen(false)}
      />

      <ConfirmDialog
        visible={addError != null}
        title={addError?.title ?? ''}
        message={addError?.message ?? ''}
        confirmLabel="OK"
        cancelLabel={GROCERY_COPY.cancel}
        onConfirm={() => setAddError(null)}
        onCancel={() => setAddError(null)}
      />

      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-3xl border border-border bg-paper px-5 pb-8 pt-5">
            <Text className="text-xl font-extrabold text-ink">{GROCERY_COPY.addItemModalTitle}</Text>
            <TextInput
              value={manualName}
              onChangeText={(text) => {
                setManualName(text);
                if (!aisleTouched) {
                  setManualCategory(inferGroceryCategoryFromName(text));
                }
              }}
              placeholder={GROCERY_COPY.itemNamePlaceholder}
              placeholderTextColor={THEME.muted}
              className="mt-4 min-h-[48px] rounded-full border border-border bg-card px-4 py-3 text-base text-ink"
            />
            <View className="mt-3 flex-row gap-2">
              <TextInput
                value={manualQty}
                onChangeText={setManualQty}
                keyboardType="decimal-pad"
                placeholder={GROCERY_COPY.qtyPlaceholder}
                placeholderTextColor={THEME.muted}
                className="min-h-[48px] w-24 rounded-full border border-border bg-card px-4 py-3 text-base text-ink"
              />
              <TextInput
                value={manualUnit}
                onChangeText={setManualUnit}
                placeholder={GROCERY_COPY.unitPlaceholder}
                placeholderTextColor={THEME.muted}
                className="min-h-[48px] flex-1 rounded-full border border-border bg-card px-4 py-3 text-base text-ink"
              />
            </View>
            <Text className="mt-4 text-[13px] font-extrabold uppercase tracking-wide text-muted">
              {GROCERY_COPY.aisleLabel}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
              {PANTRY_CATEGORIES.map((cat) => {
                const selected = manualCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      setAisleTouched(true);
                      setManualCategory(cat);
                    }}
                    className={`mr-2 min-h-[44px] items-center justify-center rounded-full border px-4 ${
                      selected ? 'border-primary bg-primary' : 'border-border bg-card'
                    }`}
                  >
                    <Text className={`text-sm font-semibold ${selected ? 'text-on-primary' : 'text-ink'}`}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View className="mt-6 flex-row gap-2">
              <Pressable
                onPress={() => setAddOpen(false)}
                className="min-h-[48px] flex-1 items-center justify-center rounded-full border border-border bg-card px-4"
              >
                <Text className="text-center text-base font-bold text-primary">{GROCERY_COPY.cancel}</Text>
              </Pressable>
              <Pressable
                disabled={addSaving}
                onPress={() => void submitManualItem()}
                className={`min-h-[48px] flex-1 items-center justify-center rounded-full bg-primary px-4 ${
                  addSaving ? 'opacity-50' : ''
                }`}
              >
                <Text className="text-center text-base font-bold text-on-primary">{GROCERY_COPY.addToList}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
