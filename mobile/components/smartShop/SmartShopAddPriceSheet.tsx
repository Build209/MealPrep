import { Ionicons } from '../../lib/icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Modal } from '../BackAwareModal';
import { SMART_SHOP_COPY } from '../../config/smartShop';
import { THEME } from '../../config/appConfig';
import { photoScanPlanBlockedMessage } from '../../lib/plans/photoScanPlanBlockedMessage';
import { useApp } from '../../context/AppContext';
import { resolvePhotoScanAccess } from '../../lib/guest/resolvePhotoScanAccess';
import { photoScanAccessUserMessage } from '../../lib/plans/photoScanAccess';
import { PhotoScanPlusUpgradeCard } from '../PhotoScanPlusUpgradeCard';
import { addCommunityDeal } from '../../lib/communityDeals/client';
import { isPastLocalDate } from '../../lib/communityDeals/localDate';
import type { CommunityStoreDeal } from '../../lib/communityDeals/types';
import type { DealsSearchResult, StoreLocation } from '../../lib/deals/types';
import {
  PantryVisionAuthError,
  PantryVisionNotConfiguredError,
  PantryVisionPlanRequiredError,
  PantryVisionRateLimitError,
  PantryVisionScanError,
} from '../../lib/pantryVision/client';
import { analyzePriceTagPhoto } from '../../lib/priceTagVision/client';
import { uploadScanPhoto } from '../../lib/scanPhotos/client';
import { getSupabase } from '../../lib/supabase';
import { pickWebImageFile } from '../../lib/web/pickWebImageFile';
import { resolveStoreChainKey } from '../../config/weeklyAds';
import {
  rememberItemSizeUnit,
  rememberLastAddPriceStore,
  readAddPriceMemory,
  readRememberedSizeUnit,
  resolveStoreFromMemory,
} from '../../lib/smartShop/addPriceMemory';
import {
  buildAddPriceItemSuggestions,
  findGroceryItemByName,
  nextUnpricedSuggestion,
  sizeUnitForGroceryItem,
} from '../../lib/smartShop/addPriceSuggestions';
import type { GroceryListItem } from '../../types/mealprep';
import { ViewScanPhotoButton } from '../ViewScanPhotoButton';

export type SmartShopAddPriceTarget = {
  store?: StoreLocation;
  itemName?: string;
  groceryItemId?: string;
};

type Props = {
  target: SmartShopAddPriceTarget | null;
  ownerId: string;
  groceryItems: GroceryListItem[];
  nearbyStores: StoreLocation[];
  communityDeals: CommunityStoreDeal[];
  dealsResult?: DealsSearchResult | null;
  onClose: () => void;
  onSaved: () => void;
};

type AddPriceFormProps = Omit<Props, 'target'> & { target: SmartShopAddPriceTarget };

function addPriceTargetKey(target: SmartShopAddPriceTarget): string {
  return `${target.groceryItemId ?? ''}|${target.itemName ?? ''}|${target.store?.id ?? ''}`;
}

function initialAddPriceFields(
  target: SmartShopAddPriceTarget,
  ownerId: string,
  groceryItems: GroceryListItem[],
  nearbyStores: StoreLocation[],
): {
  activeStore: StoreLocation | null;
  itemName: string;
  groceryItemId: string | null;
  sizeUnit: string;
} {
  const memory = readAddPriceMemory(ownerId);
  const activeStore =
    target.store ?? resolveStoreFromMemory(memory, nearbyStores) ?? nearbyStores[0] ?? null;
  const matchedById = target.groceryItemId
    ? groceryItems.find((i) => i.id === target.groceryItemId)
    : undefined;
  const matchedByName = target.itemName ? findGroceryItemByName(groceryItems, target.itemName) : undefined;
  const groceryMatch = matchedById ?? matchedByName;
  if (groceryMatch) {
    return {
      activeStore,
      itemName: groceryMatch.name,
      groceryItemId: groceryMatch.id,
      sizeUnit: sizeUnitForGroceryItem(ownerId, groceryMatch),
    };
  }
  const name = target.itemName?.trim() ?? '';
  let sizeUnit = name ? (readRememberedSizeUnit(ownerId, name) ?? '') : '';
  if (name) {
    const remembered = findGroceryItemByName(groceryItems, name);
    if (remembered) {
      sizeUnit = sizeUnitForGroceryItem(ownerId, remembered);
      return { activeStore, itemName: name, groceryItemId: remembered.id, sizeUnit };
    }
  }
  return { activeStore, itemName: name, groceryItemId: null, sizeUnit };
}

function applyGroceryItemToForm(
  ownerId: string,
  item: GroceryListItem,
  setters: {
    setItemName: (v: string) => void;
    setSizeUnit: (v: string) => void;
    setGroceryItemId: (v: string) => void;
  },
): void {
  setters.setItemName(item.name);
  setters.setSizeUnit(sizeUnitForGroceryItem(ownerId, item));
  setters.setGroceryItemId(item.id);
}

function clearPendingScan(
  setPendingScanPhotoPath: (v: string | null) => void,
  scanUploadRef: MutableRefObject<Promise<string | null> | null>,
): void {
  setPendingScanPhotoPath(null);
  scanUploadRef.current = null;
}

export function SmartShopAddPriceSheet(props: Props) {
  const { target, onClose } = props;
  return (
    <Modal visible={Boolean(target)} animationType="slide" transparent onRequestClose={onClose}>
      {target ? (
        <SmartShopAddPriceSheetForm key={addPriceTargetKey(target)} {...props} target={target} />
      ) : (
        <View className="flex-1 justify-end bg-black/40" />
      )}
    </Modal>
  );
}

function SmartShopAddPriceSheetForm({
  target,
  ownerId,
  groceryItems,
  nearbyStores,
  communityDeals,
  dealsResult,
  onClose,
  onSaved,
}: AddPriceFormProps) {
  const { demoMode, authReady, session, profile, profileReady } = useApp();
  const initialFields = initialAddPriceFields(target, ownerId, groceryItems, nearbyStores);

  const [activeStore, setActiveStore] = useState<StoreLocation | null>(initialFields.activeStore);
  const [itemName, setItemName] = useState(initialFields.itemName);
  const [groceryItemId, setGroceryItemId] = useState<string | null>(initialFields.groceryItemId);
  const [price, setPrice] = useState('');
  const [sizeUnit, setSizeUnit] = useState(initialFields.sizeUnit);
  const [saleUntil, setSaleUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingScanPhotoPath, setPendingScanPhotoPath] = useState<string | null>(null);
  const scanUploadRef = useRef<Promise<string | null> | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pricedThisSession, setPricedThisSession] = useState<Set<string>>(() => new Set());
  const [showPlusGate, setShowPlusGate] = useState(false);

  const storeKey = useMemo(
    () => (activeStore ? resolveStoreChainKey(activeStore) : null),
    [activeStore],
  );

  const suggestions = useMemo(() => {
    const base = buildAddPriceItemSuggestions({
      groceryItems,
      storeKey,
      storeId: activeStore?.id ?? null,
      communityDeals,
      dealsResult,
    });
    const enriched = base.map((s) => ({
      ...s,
      hasPriceAtStore: s.hasPriceAtStore || pricedThisSession.has(s.item.id),
    }));
    enriched.sort((a, b) => {
      if (a.hasPriceAtStore !== b.hasPriceAtStore) return a.hasPriceAtStore ? 1 : -1;
      return a.item.name.localeCompare(b.item.name);
    });
    return enriched;
  }, [groceryItems, storeKey, activeStore?.id, communityDeals, dealsResult, pricedThisSession]);

  const suggestionChips = useMemo(() => suggestions.slice(0, 12), [suggestions]);

  useEffect(() => {
    void getSupabase()
      ?.auth.getSession()
      .then(({ data }) => {
        const id = data.session?.user?.id ?? null;
        setUserId(id);
        setSignedIn(Boolean(id));
      });
  }, []);

  function selectSuggestion(suggestion: (typeof suggestions)[number]) {
    applyGroceryItemToForm(ownerId, suggestion.item, {
      setItemName,
      setSizeUnit,
      setGroceryItemId,
    });
    setPrice('');
    setError(null);
    clearPendingScan(setPendingScanPhotoPath, scanUploadRef);
  }

  function resetFormForAnother(next: (typeof suggestions)[number]) {
    applyGroceryItemToForm(ownerId, next.item, {
      setItemName,
      setSizeUnit,
      setGroceryItemId,
    });
    setPrice('');
    setSaleUntil('');
    setError(null);
    setJustSaved(false);
    clearPendingScan(setPendingScanPhotoPath, scanUploadRef);
  }

  async function handleSave() {
    const store = activeStore;
    if (!store) {
      setError(SMART_SHOP_COPY.addPricePickStore);
      return;
    }
    const parsed = Number.parseFloat(price);
    if (!itemName.trim()) {
      setError(SMART_SHOP_COPY.addPriceItemRequired);
      return;
    }
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(SMART_SHOP_COPY.addPricePriceRequired);
      return;
    }
    const sale = saleUntil.trim();
    if (sale && isPastLocalDate(sale)) {
      setError(SMART_SHOP_COPY.addPriceSaleDateInvalid);
      return;
    }

    const resolvedStoreKey = resolveStoreChainKey(store);
    if (!resolvedStoreKey) {
      setError(SMART_SHOP_COPY.addPriceStoreUnsupported);
      return;
    }

    setSubmitting(true);
    setError(null);
    let scanPhotoPath = pendingScanPhotoPath;
    if (!scanPhotoPath && scanUploadRef.current) {
      scanPhotoPath = await scanUploadRef.current;
    }

    const res = await addCommunityDeal({
      storeKey: resolvedStoreKey,
      osmStoreId: store.id.startsWith('kroger-') ? undefined : store.id,
      storeName: store.name,
      itemName: itemName.trim(),
      price: parsed,
      unit: sizeUnit.trim() || undefined,
      saleValidUntil: sale || undefined,
      scanPhotoPath,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? SMART_SHOP_COPY.addPriceSaveFailed);
      return;
    }

    rememberLastAddPriceStore(ownerId, store);
    rememberItemSizeUnit(ownerId, itemName.trim(), sizeUnit);
    const savedItemId =
      groceryItemId ?? findGroceryItemByName(groceryItems, itemName.trim())?.id ?? null;
    if (savedItemId) {
      setPricedThisSession((prev) => new Set(prev).add(savedItemId));
    }
    onSaved();
    setJustSaved(true);
  }

  function handleAddAnother() {
    const next = nextUnpricedSuggestion(suggestions, groceryItemId);
    if (!next) {
      onClose();
      return;
    }
    resetFormForAnother(next);
  }

  async function runScan(prepared: { base64: string; mimeType: string; uri?: string }) {
    setScanning(true);
    setError(null);
    setPendingScanPhotoPath(null);
    try {
      const session = await getSupabase()?.auth.getSession();
      const token = session?.data.session?.access_token ?? null;
      const uid = userId ?? session?.data.session?.user?.id ?? null;
      const imagePayload = {
        uri: prepared.uri ?? '',
        base64: prepared.base64,
        mimeType: prepared.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
        byteLength: Math.floor((prepared.base64.length * 3) / 4),
      };
      if (uid) {
        const uploadPromise = uploadScanPhoto(imagePayload, 'price-tag', uid);
        scanUploadRef.current = uploadPromise;
        void uploadPromise.then(setPendingScanPhotoPath);
      } else {
        scanUploadRef.current = null;
      }
      const result = await analyzePriceTagPhoto(imagePayload, token);
      if (result.itemName) setItemName(result.itemName);
      if (Number.isFinite(result.price)) setPrice(String(result.price));
      if (result.sizeUnit) setSizeUnit(result.sizeUnit);
      if (result.saleValidUntil) setSaleUntil(result.saleValidUntil);
    } catch (err) {
      if (err instanceof PantryVisionNotConfiguredError) {
        setError(SMART_SHOP_COPY.addPriceScanNotConfigured);
      } else if (err instanceof PantryVisionAuthError) {
        setError(SMART_SHOP_COPY.addPriceSignIn);
      } else if (err instanceof PantryVisionPlanRequiredError) {
        setShowPlusGate(true);
        setError(photoScanPlanBlockedMessage().message);
      } else if (err instanceof PantryVisionRateLimitError) {
        setError(err.message);
      } else if (err instanceof PantryVisionScanError) {
        setError(err.message);
      } else {
        setError(SMART_SHOP_COPY.addPriceScanFailed);
      }
    } finally {
      setScanning(false);
    }
  }

  async function handleSnapTag() {
    setShowPlusGate(false);
    const { access } = await resolvePhotoScanAccess(
      {
        demoMode,
        authReady,
        hasSession: Boolean(session),
        plan: profile.plan,
        role: profile.role,
        profileReady,
      },
      session,
    );
    if (access !== 'allowed') {
      const copy = photoScanAccessUserMessage(access);
      if (access === 'plan_blocked') {
        setShowPlusGate(true);
      }
      if (copy) {
        setError(copy.message);
      }
      return;
    }

    if (Platform.OS === 'web') {
      try {
        const file = await pickWebImageFile({ capture: 'environment' });
        if (!file) return;
        const { preparePantryImageFromFile } = await import('../../lib/pantryVision/prepareImage.web');
        const prepared = await preparePantryImageFromFile(file);
        await runScan(prepared);
      } catch {
        setError(SMART_SHOP_COPY.addPriceScanFailed);
      }
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError(SMART_SHOP_COPY.addPriceCameraPermission);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    try {
      const { preparePantryImage } = await import('../../lib/pantryVision/prepareImage');
      const prepared = await preparePantryImage(result.assets[0].uri);
      await runScan(prepared);
    } catch {
      setError(SMART_SHOP_COPY.addPriceScanFailed);
    }
  }

  const showStorePicker = Boolean(!target.store && nearbyStores.length > 1);

  return (
    <View className="flex-1 justify-end bg-black/40">
        <View className="max-h-[90%] rounded-t-3xl border border-border bg-paper px-4 pb-8 pt-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-ink">{SMART_SHOP_COPY.addPriceSheetTitle}</Text>
            <Pressable onPress={onClose} className="rounded-full p-2">
              <Ionicons name="close" size={22} color={THEME.muted} />
            </Pressable>
          </View>

          {activeStore ? (
            <Text className="mb-3 text-sm text-muted">{activeStore.chain || activeStore.name}</Text>
          ) : (
            <Text className="mb-3 text-sm text-amber-900">{SMART_SHOP_COPY.addPricePickStore}</Text>
          )}

          {showStorePicker ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 max-h-12">
              {nearbyStores.map((store) => {
                const selected = store.id === activeStore?.id;
                return (
                  <Pressable
                    key={store.id}
                    onPress={() => setActiveStore(store)}
                    className={`mr-2 rounded-full border px-3 py-1.5 ${selected ? 'border-primary bg-primary-light' : 'border-border bg-card'}`}
                  >
                    <Text
                      className={`text-xs font-semibold ${selected ? 'text-primary-dark' : 'text-ink'}`}
                      numberOfLines={1}
                    >
                      {store.chain || store.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {signedIn === false ? (
            <Text className="mb-3 text-sm text-amber-900">{SMART_SHOP_COPY.addPriceSignIn}</Text>
          ) : null}

          {justSaved ? (
            <View className="py-2">
              <Text className="text-base font-bold text-ink">{SMART_SHOP_COPY.addPriceSavedTitle}</Text>
              <Text className="mt-2 text-sm text-muted">{SMART_SHOP_COPY.addPriceSavedBody}</Text>
              <View className="mt-4 flex-row gap-2">
                <Pressable
                  onPress={() => handleAddAnother()}
                  className="flex-1 rounded-full bg-primary px-3 py-3"
                >
                  <Text className="text-center text-sm font-bold text-on-primary">
                    {SMART_SHOP_COPY.addPriceAddAnother}
                  </Text>
                </Pressable>
                <Pressable onPress={onClose} className="rounded-xl border border-border px-4 py-3">
                  <Text className="text-sm font-semibold text-muted">{SMART_SHOP_COPY.addPriceDone}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {suggestionChips.length > 0 ? (
                <View className="mb-3">
                  <Text className="text-xs font-bold text-muted">{SMART_SHOP_COPY.addPriceFromListLabel}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2 max-h-24">
                    {suggestionChips.map((suggestion) => {
                      const selected = suggestion.item.id === groceryItemId;
                      return (
                        <Pressable
                          key={suggestion.item.id}
                          onPress={() => selectSuggestion(suggestion)}
                          className={`mr-2 rounded-full border px-3 py-1.5 ${selected ? 'border-primary bg-primary-light' : 'border-border bg-card'}`}
                        >
                          <Text
                            className={`text-xs font-semibold ${selected ? 'text-primary-dark' : 'text-ink'}`}
                            numberOfLines={1}
                          >
                            {suggestion.item.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <Text className="text-xs font-bold text-muted">{SMART_SHOP_COPY.addPriceItemLabel}</Text>
              <TextInput
                value={itemName}
                onChangeText={(text) => {
                  setItemName(text);
                  setGroceryItemId(null);
                }}
                placeholder="Item on your list"
                placeholderTextColor={THEME.muted}
                className="mt-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
              />

              <View className="mt-3 flex-row gap-2">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-muted">{SMART_SHOP_COPY.addPricePriceLabel}</Text>
                  <TextInput
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={THEME.muted}
                    className="mt-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-muted">{SMART_SHOP_COPY.addPriceSizeLabel}</Text>
                  <TextInput
                    value={sizeUnit}
                    onChangeText={setSizeUnit}
                    placeholder={SMART_SHOP_COPY.addPriceSizePlaceholder}
                    placeholderTextColor={THEME.muted}
                    className="mt-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
                  />
                </View>
              </View>

              <Text className="mt-3 text-xs font-bold text-muted">{SMART_SHOP_COPY.addPriceSaleUntilLabel}</Text>
              <TextInput
                value={saleUntil}
                onChangeText={setSaleUntil}
                placeholder={SMART_SHOP_COPY.addPriceSaleUntilPlaceholder}
                placeholderTextColor={THEME.muted}
                className="mt-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink"
              />

              {error ? <Text className="mt-2 text-xs text-danger">{error}</Text> : null}

              {showPlusGate ? <PhotoScanPlusUpgradeCard onDismiss={() => setShowPlusGate(false)} /> : null}

              <Pressable
                onPress={() => void handleSnapTag()}
                disabled={scanning || submitting}
                className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-primary bg-primary-light/40 px-3 py-3"
              >
                {scanning ? (
                  <ActivityIndicator size="small" color={THEME.primary} />
                ) : (
                  <Ionicons name="camera-outline" size={20} color={THEME.primary} />
                )}
                <Text className="text-sm font-bold text-primary-dark">
                  {scanning ? SMART_SHOP_COPY.addPriceScanning : SMART_SHOP_COPY.addPriceScanTag}
                </Text>
              </Pressable>

              {pendingScanPhotoPath ? (
                <ViewScanPhotoButton scanPhotoPath={pendingScanPhotoPath} />
              ) : null}

              <View className="mt-4 flex-row gap-2">
                <Pressable
                  onPress={() => void handleSave()}
                  disabled={submitting || scanning || signedIn === false}
                  className="flex-1 rounded-full bg-primary px-3 py-3"
                >
                  <Text className="text-center text-sm font-bold text-on-primary">
                    {submitting ? 'Saving…' : SMART_SHOP_COPY.addPriceSave}
                  </Text>
                </Pressable>
                <Pressable onPress={onClose} className="rounded-xl border border-border px-4 py-3">
                  <Text className="text-sm font-semibold text-muted">{SMART_SHOP_COPY.addPriceCancel}</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
  );
}
