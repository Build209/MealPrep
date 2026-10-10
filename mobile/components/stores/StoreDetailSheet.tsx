import { Ionicons } from '../../lib/icons/Ionicons';
import { Linking, Pressable, Text, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import { STORES_TAB_COPY } from '../../config/storesTab';
import { THEME } from '../../config/appConfig';
import { mapsDirectionsUrl } from '../../config/smartShop';
import type { StoreLocation } from '../../lib/deals/types';
import { formatDistanceMiles } from '../../lib/stores/storeDistance';
import { openExternalUrl } from '../../lib/smartShop/openExternalUrl';
import {
  resolveStorePageUrl,
  resolveStorePageUsesGoogleMaps,
  resolveStorePhone,
  resolveWeeklyAdLink,
} from '../../lib/stores/storeLinks';
import { formatStoreAddress } from '../../lib/stores/formatAddress';
import { StoreDeliveryRow } from './StoreDeliveryRow';

type Props = {
  store: StoreLocation | null;
  searchOriginZip?: string;
  onClose: () => void;
};

export function StoreDetailSheet({ store, searchOriginZip, onClose }: Props) {
  if (!store) return null;

  const phone = resolveStorePhone(store);
  const directionsUrl = mapsDirectionsUrl(store);
  const storePageOptions = searchOriginZip ? { fallbackZip: searchOriginZip } : undefined;
  const storePageUrl = resolveStorePageUrl(store, storePageOptions);
  const storePageLabel = resolveStorePageUsesGoogleMaps(store, storePageOptions)
    ? STORES_TAB_COPY.detailViewOnGoogleMaps
    : STORES_TAB_COPY.detailStorePage;
  const weeklyAd = resolveWeeklyAdLink(store);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="max-h-[85%] rounded-t-3xl border border-border bg-card px-4 pb-8 pt-4">
          <View className="mb-3 flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-xl font-extrabold text-ink">{store.chain || store.name}</Text>
              {store.chain && store.name !== store.chain ? (
                <Text className="mt-0.5 text-sm text-muted">{store.name}</Text>
              ) : null}
              <Text className="mt-2 text-sm text-muted">{formatStoreAddress(store)}</Text>
              <View className="mt-2 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
                {store.distanceMiles != null ? (
                  <Text className="text-sm font-medium text-ink">{formatDistanceMiles(store.distanceMiles)}</Text>
                ) : null}
                {store.openNow != null ? (
                  <Text className={`text-[13px] font-semibold ${store.openNow ? 'text-primary' : 'text-muted'}`}>
                    {store.openNow ? STORES_TAB_COPY.openNow : STORES_TAB_COPY.closedNow}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close store details"
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
            >
              <Ionicons name="close" size={24} color={THEME.muted} />
            </Pressable>
          </View>

          {store.pricingTeaser === 'coming_soon' ? (
            <View className="mb-4 rounded-2xl border border-border bg-paper px-4 py-3">
              <Text className="text-[13px] font-semibold text-muted">{STORES_TAB_COPY.noPricesYet}</Text>
            </View>
          ) : null}

          <View className="gap-2">
            <Pressable
              onPress={() => void openExternalUrl(directionsUrl)}
              className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 active:opacity-80"
            >
              <Ionicons name="navigate" size={20} color={THEME.onPrimary} />
              <Text className="font-bold text-on-primary">{STORES_TAB_COPY.detailDirections}</Text>
            </Pressable>

            {phone ? (
              <Pressable
                onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)}
                className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full border border-primary bg-card px-4 py-3 active:opacity-80"
              >
                <Ionicons name="call-outline" size={20} color={THEME.primary} />
                <Text className="font-bold text-primary">{STORES_TAB_COPY.detailCall}</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => void openExternalUrl(storePageUrl)}
              className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full border border-primary bg-card px-4 py-3 active:opacity-80"
            >
              <Ionicons name="storefront-outline" size={20} color={THEME.primary} />
              <Text className="font-bold text-primary">{storePageLabel}</Text>
            </Pressable>

            {weeklyAd ? (
              <Pressable
                onPress={() => void openExternalUrl(weeklyAd.url)}
                className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full border border-primary bg-card px-4 py-3 active:opacity-80"
              >
                <Ionicons name="newspaper-outline" size={20} color={THEME.primary} />
                <Text className="font-bold text-primary">
                  {weeklyAd.thirdParty ? STORES_TAB_COPY.detailWeeklyAdThirdParty : STORES_TAB_COPY.detailWeeklyAd}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <StoreDeliveryRow store={store} />
        </View>
      </View>
    </Modal>
  );
}
