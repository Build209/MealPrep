import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Modal } from './BackAwareModal';
import { formatQuantityWithUnit } from '../lib/formatQuantity';
import type { MealMadeReviewRow } from '../lib/mealPlan/pantryDeduction';
import { THEME } from '../config/appConfig';

export interface MealMadeReviewSheetProps {
  visible: boolean;
  mealTitle: string;
  /** Rows carry the exact amount Confirm deducts (scaled, whole counts rounded). */
  rows: MealMadeReviewRow[];
  selectedPantryIds: Set<string>;
  onTogglePantryItem: (pantryItemId: string, useFromPantry: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function MealMadeReviewSheet({
  visible,
  mealTitle,
  rows,
  selectedPantryIds,
  onTogglePantryItem,
  onConfirm,
  onCancel,
  busy = false,
}: MealMadeReviewSheetProps) {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 justify-end bg-black/45" onPress={onCancel}>
        <Pressable
          className="max-h-[85%] rounded-t-3xl border border-border bg-paper px-4 pb-6 pt-4"
          onPress={(event) => event.stopPropagation()}
        >
          <Text className="text-lg font-bold text-ink">Made it</Text>
          <Text className="mt-1 text-sm text-muted" numberOfLines={2}>{mealTitle}</Text>
          <Text className="mt-3 text-xs text-muted">
            Uncheck anything you did not use from the pantry, including staples.
          </Text>

          <ScrollView className="mt-3 max-h-72">
            {rows.length === 0 ? (
              <Text className="py-4 text-sm text-muted">No pantry ingredients matched this recipe.</Text>
            ) : (
              rows.map((row) => {
                const pantryItem = row.matchedPantryItem;
                if (!pantryItem) return null;
                const checked = selectedPantryIds.has(pantryItem.id);
                return (
                  <View
                    key={pantryItem.id}
                    className="mb-2 flex-row items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <View className="mr-2 flex-1">
                      <Text className="font-semibold text-ink">{pantryItem.name}</Text>
                      <Text className="text-xs text-muted">
                        Recipe: {row.ingredient.name} · use{' '}
                        {formatQuantityWithUnit(row.deductQuantity, row.ingredient.unit)}
                      </Text>
                    </View>
                    <Switch
                      value={checked}
                      onValueChange={(value) => onTogglePantryItem(pantryItem.id, value)}
                      trackColor={{ true: THEME.primary, false: THEME.border }}
                    />
                  </View>
                );
              })
            )}
          </ScrollView>

          <View className="mt-4 flex-row gap-2">
            <Pressable
              disabled={busy}
              onPress={onCancel}
              className="flex-1 rounded-xl border border-border py-3"
            >
              <Text className="text-center text-sm font-bold text-slate">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onConfirm}
              className={`flex-1 rounded-full bg-primary py-3 ${busy ? 'opacity-60' : ''}`}
            >
              <Text className="text-center text-sm font-bold text-on-primary">
                {busy ? 'Saving…' : 'Confirm'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
