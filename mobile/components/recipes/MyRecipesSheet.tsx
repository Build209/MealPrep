import { Pressable, ScrollView, Text, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../../lib/icons/Ionicons';
import { THEME } from '../../config/appConfig';
import { SAVED_RECIPES_COPY } from '../../config/savedRecipes';
import type { RecipesTabRow } from '../../config/recipesTabFilters';
import { RecipesUnifiedFeedCard } from './RecipesUnifiedFeedCard';

export function MyRecipesSheet({
  visible,
  onClose,
  rows,
  guestHint,
  onOpenRow,
}: {
  visible: boolean;
  onClose: () => void;
  rows: RecipesTabRow[];
  guestHint?: boolean;
  onOpenRow: (row: RecipesTabRow) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-paper" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center border-b border-border bg-card px-3 py-2">
          <Pressable onPress={onClose} accessibilityLabel="Close My Recipes" className="p-2">
            <Ionicons name="close" size={22} color={THEME.ink} />
          </Pressable>
          <Text className="flex-1 text-center text-sm font-semibold text-ink">
            {SAVED_RECIPES_COPY.myRecipesTitle}
          </Text>
          <View className="w-10" />
        </View>
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
                onOpen={() => onOpenRow(row)}
              />
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
