import { Ionicons } from '../../lib/icons/Ionicons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { THEME } from '../../config/appConfig';
import { mapsDirectionsUrl } from '../../config/smartShop';
import { STORES_TAB_COPY } from '../../config/storesTab';
import type { StoreLocation } from '../../lib/deals/types';
import { openExternalUrl } from '../../lib/smartShop/openExternalUrl';
import { formatDistanceMiles } from '../../lib/stores/storeDistance';
import { resolveWeeklyAdLink } from '../../lib/stores/storeLinks';

type Props = {
  /** Recognised chains and brands, closest first. */
  stores: StoreLocation[];
  /** Unbranded local markets, closest first. Shown behind "More local markets". */
  localStores?: StoreLocation[];
  /** True while the shopper is typing in the search box: matches in both groups are shown. */
  searching?: boolean;
  onSelectStore: (store: StoreLocation) => void;
};

function StoreCard({
  store,
  onSelectStore,
}: {
  store: StoreLocation;
  onSelectStore: (store: StoreLocation) => void;
}) {
  const displayName = store.chain || store.name;
  const town = [store.city, store.state].filter(Boolean).join(', ');
  const distance = store.distanceMiles != null ? formatDistanceMiles(store.distanceMiles) : '';
  const townAndDistance = [town, distance].filter(Boolean).join(' · ');
  const weeklyAd = resolveWeeklyAdLink(store);
  const weeklyAdLabel = weeklyAd?.thirdParty
    ? STORES_TAB_COPY.detailWeeklyAdThirdParty
    : STORES_TAB_COPY.detailWeeklyAd;
  const noPricesYet =
    store.pricingTeaser === 'coming_soon' || !store.pricingSource || store.pricingSource === 'none';
  return (
    <View className="mb-3.5 rounded-[20px] border border-border bg-card px-4 py-3.5">
      <Pressable
        onPress={() => onSelectStore(store)}
        accessibilityRole="button"
        className="min-h-[44px] flex-row items-start justify-between gap-2 active:opacity-80"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-[17px] font-extrabold text-ink">{displayName}</Text>
          <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
            {townAndDistance ? <Text className="text-sm text-muted">{townAndDistance}</Text> : null}
            {store.openNow != null ? (
              <Text className={`text-[13px] font-semibold ${store.openNow ? 'text-primary' : 'text-muted'}`}>
                {store.openNow ? STORES_TAB_COPY.openNow : STORES_TAB_COPY.closedNow}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="h-11 items-center justify-center">
          <Ionicons name="chevron-forward" size={20} color={THEME.muted} />
        </View>
      </Pressable>

      <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
        <Pressable
          onPress={() => void openExternalUrl(mapsDirectionsUrl(store))}
          accessibilityRole="button"
          accessibilityLabel={`${STORES_TAB_COPY.detailDirections}: ${displayName}`}
          className="min-h-[44px] items-center justify-center rounded-full bg-primary px-4 active:opacity-80"
        >
          <Text className="text-sm font-bold text-on-primary">{STORES_TAB_COPY.detailDirections}</Text>
        </Pressable>
        {weeklyAd ? (
          <Pressable
            onPress={() => void openExternalUrl(weeklyAd.url)}
            accessibilityRole="button"
            accessibilityLabel={`${weeklyAdLabel}: ${displayName}`}
            className="min-h-[44px] items-center justify-center rounded-full border border-primary bg-card px-4 active:opacity-80"
          >
            <Text className="text-sm font-bold text-primary">{weeklyAdLabel}</Text>
          </Pressable>
        ) : null}
        {noPricesYet ? (
          <Text className="ml-auto text-[13px] font-semibold text-muted">{STORES_TAB_COPY.noPricesYet}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function StoresNearbyList({ stores, localStores = [], searching = false, onSelectStore }: Props) {
  const [showLocal, setShowLocal] = useState(false);

  // The Stores tab prints its own "no match" / "no stores nearby" line; printing one here too
  // showed "No stores match your search." twice.
  if (stores.length === 0 && localStores.length === 0) {
    return null;
  }

  // With no recognised store to lead with, hiding everything behind a button would look like an empty list.
  const localOnly = stores.length === 0;
  const localVisible = localOnly || searching || showLocal;
  const showToggle = localStores.length > 0 && !localOnly && !searching;

  return (
    <View className="mt-3.5">
      {stores.map((store) => (
        <StoreCard key={store.id} store={store} onSelectStore={onSelectStore} />
      ))}

      {showToggle ? (
        <Pressable
          onPress={() => setShowLocal((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showLocal }}
          className="mb-3.5 min-h-[44px] flex-row items-center justify-center self-start rounded-full border border-primary bg-card px-4 active:opacity-80"
        >
          <Text className="text-sm font-bold text-primary">
            {showLocal
              ? STORES_TAB_COPY.hideLocalMarkets
              : `${STORES_TAB_COPY.moreLocalMarkets} (${localStores.length})`}
          </Text>
          <View className="ml-1">
            <Ionicons name={showLocal ? 'chevron-up' : 'chevron-down'} size={16} color={THEME.primary} />
          </View>
        </Pressable>
      ) : null}

      {localVisible && localStores.length > 0 ? (
        <View>
          {!localOnly && searching ? (
            <Text className="mb-2 text-sm font-bold text-ink">{STORES_TAB_COPY.localMarketsHeading}</Text>
          ) : null}
          <Text className="mb-2.5 text-xs leading-4 text-muted">{STORES_TAB_COPY.localMarketsNote}</Text>
          {localStores.map((store) => (
            <StoreCard key={store.id} store={store} onSelectStore={onSelectStore} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
