import Feather from '@expo/vector-icons/Feather';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useProfile } from '../data';
import { useFavoriteStores, useNearbyStoresList } from '../data/stores';
import { colors, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { STORES_COPY } from './copy';
import { searchOriginFromProfile } from './logic';
import { BADGE_SIZE, StoreBadge } from './StoreBadge';
import { hasSavedLocation, pickRowStores, showFindStores } from './storeRow';

/** Wide enough for a short chain name in two lines under the circle; well over the 44px tap target. */
const ITEM_WIDTH = 80;

function Circle({
  label,
  a11y,
  testID,
  onPress,
  children,
}: {
  label: string;
  a11y: string;
  testID: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({
        width: ITEM_WIDTH,
        minHeight: touch.min,
        alignItems: 'center',
        gap: 4,
        paddingVertical: 2,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {children}
      <AppText variant="label" numberOfLines={2} style={{ textAlign: 'center' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * The row of store circles at the top of the Grocery list (owner, 2026-10-16): up to 3 favourite
 * stores, newest first, then the closest stores to fill the row (only when a location is already
 * saved; this row never asks for location). With room left and nothing to fill it, a "Find stores"
 * circle opens the Stores view. Reads the same queries as the Stores view, so it shows the last
 * loaded data offline.
 */
export function StoresRow({ onOpenStore, onFindStores }: { onOpenStore: (key: string) => void; onFindStores: () => void }) {
  const profile = useProfile();
  const favorites = useFavoriteStores();
  const origin = useMemo(() => searchOriginFromProfile(profile.data ?? null), [profile.data]);
  const located = profile.data != null && hasSavedLocation(origin);
  const nearby = useNearbyStoresList(origin, 1, located);

  const picked = useMemo(
    () => pickRowStores({ favorites: favorites.data ?? [], chains: nearby.list.chains, local: nearby.list.local }),
    [favorites.data, nearby.list],
  );

  // Nothing until the profile and favourites are known (no circles jumping about), unless offline
  // with nothing loaded: then the row still offers "Find stores".
  const loading = (q: { isPending: boolean; isPaused: boolean; isError: boolean }) => q.isPending && !q.isPaused && !q.isError;
  if (loading(profile) || loading(favorites)) return null;

  const findStores = showFindStores(picked.length, located, nearby.isPending);
  if (picked.length === 0 && !findStores) return null;

  return (
    <View accessibilityLabel={STORES_COPY.rowA11y} testID="grocery-store-row" style={{ gap: 4 }}>
      <AppText variant="secondary" bold color="muted">
        {STORES_COPY.rowTitle}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Bleeds to the right edge (DESIGN.md: sideways rows show there is more).
        style={{ marginRight: -space.gutter }}
        contentContainerStyle={{ gap: space.gap, paddingRight: space.gutter }}
      >
        {picked.map((store) => (
          <Circle
            key={store.key}
            label={store.name}
            a11y={STORES_COPY.rowStoreA11y(store.name, store.kind === 'favorite')}
            testID={`store-row-${store.key}`}
            onPress={() => onOpenStore(store.key)}
          >
            <StoreBadge chain={store.chain} />
          </Circle>
        ))}
        {findStores ? (
          <Circle label={STORES_COPY.findStores} a11y={STORES_COPY.findStoresA11y} testID="store-row-find" onPress={onFindStores}>
            <View
              style={{
                width: BADGE_SIZE,
                height: BADGE_SIZE,
                borderRadius: BADGE_SIZE / 2,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="map-pin" size={24} color={colors.ink} accessibilityElementsHidden importantForAccessibility="no" />
            </View>
          </Circle>
        ) : null}
      </ScrollView>
    </View>
  );
}
