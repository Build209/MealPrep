import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '../../lib/icons/Ionicons';
import { THEME } from '../../config/appConfig';
import { GROCERY_COPY } from '../../config/grocery';
import { logUsageEvent } from '../../lib/usage/usageLog';
import {
  hideUsualItemForGood,
  readUsualSuggestions,
  subscribeUsualItems,
  type UsualSuggestion,
} from '../../lib/usual/usualItems';
import type { PantryCategory } from '../../types/mealprep';

type Props = {
  /** Names on the grocery list now (ticked or not): those are never offered. */
  groceryNames: string[];
  onAdd: (item: { name: string; quantity: number; unit: string; category: PantryCategory }) => Promise<unknown>;
};

/**
 * "Your usuals" on the Grocery tab (learning step 2): items this household buys regularly whose
 * usual time has nearly come, each with one tap to add and one tap to say "not a usual".
 * Renders nothing until there is something to offer, so a new account never sees an empty card.
 */
export function UsualItemsCard({ groceryNames, onAdd }: Props) {
  const namesKey = groceryNames.join('\n');
  const [suggestions, setSuggestions] = useState<UsualSuggestion[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSuggestions(readUsualSuggestions(namesKey ? namesKey.split('\n') : []));
  }, [namesKey]);

  useEffect(() => {
    refresh();
    return subscribeUsualItems(refresh);
  }, [refresh]);

  if (suggestions.length === 0) return null;

  async function add(item: UsualSuggestion) {
    if (busyKey) return;
    setBusyKey(item.key);
    try {
      await onAdd({ name: item.name, quantity: item.quantity, unit: item.unit, category: item.category });
      logUsageEvent('usual_item_added');
    } catch {
      // The Grocery screen shows its own error line when a save fails.
    } finally {
      setBusyKey(null);
    }
  }

  function hide(item: UsualSuggestion) {
    hideUsualItemForGood(item.key);
    logUsageEvent('usual_item_hidden');
  }

  return (
    <View className="mt-[14px] rounded-[18px] border border-border bg-card px-4 py-3.5">
      <Text accessibilityRole="header" className="text-base font-extrabold text-ink">
        {GROCERY_COPY.usualsTitle}
      </Text>
      <Text className="mt-0.5 text-xs text-muted">{GROCERY_COPY.usualsBlurb}</Text>
      {suggestions.map((item) => (
        <View key={item.key} className="mt-2 min-h-[44px] flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
              {item.name}
            </Text>
            <Text className="text-xs text-muted" numberOfLines={1}>
              {GROCERY_COPY.usualsEvery(item.gapDays)}
            </Text>
          </View>
          <Pressable
            onPress={() => void add(item)}
            disabled={busyKey != null}
            accessibilityRole="button"
            accessibilityLabel={GROCERY_COPY.usualsAddA11y(item.name)}
            className={`h-11 flex-row items-center justify-center gap-1 rounded-full bg-primary px-4 active:opacity-90 ${
              busyKey === item.key ? 'opacity-50' : ''
            }`}
          >
            <Ionicons name="add" size={16} color={THEME.onPrimary} />
            <Text className="text-sm font-bold text-on-primary">{GROCERY_COPY.usualsAdd}</Text>
          </Pressable>
          <Pressable
            onPress={() => hide(item)}
            accessibilityRole="button"
            accessibilityLabel={GROCERY_COPY.usualsHideA11y(item.name)}
            className="h-11 w-11 items-center justify-center rounded-full border border-border bg-card active:opacity-90"
          >
            <Ionicons name="close" size={18} color={THEME.muted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
