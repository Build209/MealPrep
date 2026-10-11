import { Ionicons } from '../../lib/icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SmartShopLocationModal } from '../../components/smartShop/SmartShopLocationModal';
import { StoreDetailSheet } from '../../components/stores/StoreDetailSheet';
import { StoresLocationPrePrompt } from '../../components/stores/StoresLocationPrePrompt';
import { StoresNearbyList } from '../../components/stores/StoresNearbyList';
import { STORES_TAB_COPY } from '../../config/storesTab';
import { THEME } from '../../config/appConfig';
import { useApp } from '../../context/AppContext';
import { useTutorialTarget } from '../../hooks/useTutorial';
import type { StoreLocation } from '../../lib/deals/types';
import { useNearbyStoresList } from '../../lib/stores/useNearbyStoresList';
import {
  storesTabShowsLoadError,
  storesTabShowsLoading,
  storesTabShowsNoSearchResults,
  storesTabShowsNoStoresNearby,
} from '../../lib/stores/storesTabEmptyState';

export default function StoresScreen() {
  const { profile } = useApp();
  const stores = useNearbyStoresList(profile);
  const [selectedStore, setSelectedStore] = useState<StoreLocation | null>(null);
  // The first-time tour lights up the store search.
  const tutorialSearchRef = useTutorialTarget('stores-search');

  const listPhase = {
    loadingStores: stores.loadingStores,
    storeSearchFailed: stores.storeSearchFailed,
    filteredCount: stores.filteredStores.length,
    hasSearchQuery: Boolean(stores.query.trim()),
  };

  return (
    <View className="flex-1 bg-paper">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="font-display text-[32px] leading-[34px] text-ink">{STORES_TAB_COPY.title}</Text>
        <View className="flex-row flex-wrap items-center">
          <Ionicons name="location-outline" size={16} color={THEME.muted} />
          <Text className="ml-1.5 shrink text-[15px] text-muted">
            {STORES_TAB_COPY.nearPrefix} {stores.locationSummary}
          </Text>
          <Pressable
            onPress={() => stores.setLocationModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={STORES_TAB_COPY.changeLocationA11y}
            className="min-h-[44px] justify-center px-2 active:opacity-70"
          >
            <Text className="text-[15px] font-bold text-primary">{STORES_TAB_COPY.changeLocation}</Text>
          </Pressable>
        </View>

        {stores.showLocationPrePrompt ? (
          <StoresLocationPrePrompt
            onUseLocation={() => void stores.handleUseLocation()}
            onEnterZip={() => stores.setLocationModalOpen(true)}
            locationDeniedHelp={stores.locationDeniedHelp}
            showZipField={Boolean(stores.locationDeniedHelp)}
            zip={stores.zip}
            onZipChange={stores.setZip}
            onSaveZip={() => void stores.handleSaveZip()}
          />
        ) : null}

        <View ref={tutorialSearchRef} className="mt-3.5 h-12 flex-row items-center rounded-full border border-border bg-card px-4">
          <Ionicons name="search" size={20} color={THEME.muted} />
          <TextInput
            value={stores.query}
            onChangeText={stores.setQuery}
            placeholder={STORES_TAB_COPY.searchPlaceholder}
            placeholderTextColor={THEME.muted}
            accessibilityLabel={STORES_TAB_COPY.searchPlaceholder}
            className="ml-2.5 h-12 min-w-0 flex-1 py-0 text-base text-ink"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {stores.updatingStores ? (
          <Text className="mt-2 text-xs text-muted">{STORES_TAB_COPY.updating}</Text>
        ) : null}
        {stores.storeSearchWarning && stores.filteredStores.length > 0 ? (
          <Text className="mt-2 text-xs text-muted">{stores.storeSearchWarning}</Text>
        ) : null}

        {storesTabShowsLoading(listPhase) ? (
          <View className="mt-8 items-center">
            <ActivityIndicator color={THEME.primary} />
            <Text className="mt-3 text-sm text-muted">{STORES_TAB_COPY.loading}</Text>
          </View>
        ) : null}

        {storesTabShowsLoadError(listPhase) ? (
          <View className="mt-3.5 rounded-[20px] border border-border bg-card px-4 py-4">
            <Text className="text-sm text-muted">{STORES_TAB_COPY.loadFailed}</Text>
            <Pressable
              onPress={stores.retryStoreSearch}
              accessibilityRole="button"
              className="mt-3 min-h-[44px] items-center justify-center self-start rounded-full bg-primary px-4 active:opacity-80"
            >
              <Text className="text-sm font-bold text-on-primary">{STORES_TAB_COPY.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        {storesTabShowsNoSearchResults(listPhase) ? (
          <Text className="mt-3.5 text-sm text-muted">{STORES_TAB_COPY.emptySearch}</Text>
        ) : null}

        {storesTabShowsNoStoresNearby(listPhase) ? (
          <View className="mt-3.5">
            <Text className="text-sm text-muted">{STORES_TAB_COPY.noStores}</Text>
            {stores.canWidenSearch ? (
              <Pressable
                onPress={stores.widenStoreSearch}
                accessibilityRole="button"
                className="mt-3 min-h-[44px] items-center justify-center self-start rounded-full border border-primary bg-card px-4 active:opacity-80"
              >
                <Text className="text-sm font-bold text-primary">{STORES_TAB_COPY.widenSearch}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!storesTabShowsLoading(listPhase) || stores.filteredStores.length > 0 ? (
          <StoresNearbyList
            stores={stores.filteredChainStores}
            localStores={stores.filteredLocalStores}
            searching={listPhase.hasSearchQuery}
            onSelectStore={setSelectedStore}
          />
        ) : null}

        {stores.error && !storesTabShowsLoadError(listPhase) ? (
          <Text className="mt-3 text-sm text-danger">{stores.error}</Text>
        ) : null}

        <Text className="mt-2 text-xs leading-4 text-muted">{STORES_TAB_COPY.attribution}</Text>
      </ScrollView>

      <SmartShopLocationModal
        visible={stores.locationModalOpen}
        zip={stores.zip}
        onZipChange={stores.setZip}
        locationHint={stores.locationHint}
        loadingStores={stores.loadingStores}
        onUseLocation={() => void stores.handleUseLocation()}
        onSaveZip={() => void stores.handleSaveZip()}
        onRequestClose={() => stores.setLocationModalOpen(false)}
      />

      <StoreDetailSheet
        store={selectedStore}
        searchOriginZip={stores.searchZip}
        onClose={() => setSelectedStore(null)}
      />
    </View>
  );
}
