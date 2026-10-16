import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { TextInput, View, type ScrollView } from 'react-native';
import { DataError, OFFLINE_MESSAGE, useIsOnline, useProfile } from '../data';
import {
  nextSortOrder,
  useFavoriteStores,
  useNearbyStoresList,
  useSaveHomeLocation,
  useToggleFavoriteStore,
  ZIP_LOOKUP_FAILED,
  ZIP_NOT_FOUND,
  type SaveLocationVars,
} from '../data/stores';
import { colors, fonts, radius, space, touch, type as typeScale } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { revealInScroll } from '../ui/revealInScroll';
import { Screen } from '../ui/Screen';
import { partitionSaved } from './cardLogic';
import { STORES_COPY } from './copy';
import { favoriteStoreKey } from './kroger';
import { LocationPanel } from './LocationPanel';
import { locateDevice, locationDeniedHelp, queryGeoPermission } from './location';
import {
  filterStoresList,
  isValidUsZip,
  searchOriginFromProfile,
  shouldAutoLocate,
  shouldShowLocationPrompt,
  type GeoPermission,
  type SearchOrigin,
  type Store,
} from './logic';
import { StoreCard } from './StoreCard';
import { geocodeUsZip, lookupLocalZip } from './zipGeocode';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function originLabel(origin: SearchOrigin): string {
  if (origin.kind === 'gps') return STORES_COPY.nearYourLocation;
  const place = lookupLocalZip(origin.zip)?.label;
  return place ? `${place} (${origin.zip})` : origin.zip;
}

/**
 * Stores (spec v1 feature 8), shown inside the Grocery tab ("List" | "Stores", owner 2026-10-15;
 * it was its own tab until then; /stores now opens this view): nearby stores from the app's own store list, recognised
 * chains first then local markets, each closest first; a weekly-ad link where the chain has one;
 * Save a store (server, optimistic); and the search location (device location or ZIP), saved on
 * the profile rounded. Kroger-family locations are merged in as the old tab does.
 */
export function StoresScreen({
  title = STORES_COPY.title,
  top,
  focusStoreKey,
}: {
  title?: string;
  top?: ReactNode;
  /** A store tapped in the Grocery list's row (its favourite key): outlined and scrolled to, when listed. */
  focusStoreKey?: string;
} = {}) {
  const profile = useProfile();
  const online = useIsOnline();
  const origin = useMemo(() => searchOriginFromProfile(profile.data ?? null), [profile.data]);
  const [radiusMultiplier, setRadiusMultiplier] = useState<1 | 2>(1);
  const stores = useNearbyStoresList(origin, radiusMultiplier);
  const favorites = useFavoriteStores();
  const toggle = useToggleFavoriteStore();
  const saveLocation = useSaveHomeLocation();

  const [permission, setPermission] = useState<GeoPermission | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showLocal, setShowLocal] = useState(false);
  const autoLocated = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const revealed = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    void queryGeoPermission().then((state) => {
      if (live) setPermission(state);
    });
    return () => {
      live = false;
    };
  }, []);

  async function locateMe() {
    setLocationError(null);
    setLocating(true);
    const position = await locateDevice();
    setLocating(false);
    if (!position.ok) {
      // Refused or unavailable: the old app falls back to the ZIP with the "Location is off" help.
      // Phones know why (refused, services off, timed out) and say so in plain words; web reports
      // 'failed' with no message and keeps its old fallback.
      if (position.problem === 'denied' || position.problem === 'unavailable') {
        setPermission(position.problem);
      } else if (position.problem === 'failed' && position.message === null) {
        setPermission((await queryGeoPermission()) === 'unavailable' ? 'unavailable' : 'denied');
      }
      if (position.message) setLocationError(position.message);
      setPanelOpen(true);
      return;
    }
    const saved = profile.data;
    if (saved && saved.homeLat === position.lat && saved.homeLng === position.lng) {
      setPanelOpen(false);
      return; // nothing new to save
    }
    save({ kind: 'gps', lat: position.lat, lng: position.lng });
  }

  function save(vars: SaveLocationVars) {
    saveLocation.mutate(vars, {
      onSuccess: () => {
        setPanelOpen(false);
        setRadiusMultiplier(1);
      },
      onError: (error) => setLocationError(STORES_COPY.saveFailed(messageOf(error))),
    });
  }

  async function saveZip(raw: string) {
    setLocationError(null);
    const zip = raw.trim();
    if (!isValidUsZip(zip)) {
      setLocationError(STORES_COPY.zipInvalid);
      return;
    }
    const found = await geocodeUsZip(zip);
    if (!found.ok) {
      setLocationError(found.reason === 'network' ? ZIP_LOOKUP_FAILED : ZIP_NOT_FOUND);
      return;
    }
    save({ kind: 'zip', zip: zip.slice(0, 5) });
  }

  // Already allowed in the browser: locate on open, once (the old app's auto-locate).
  useEffect(() => {
    if (autoLocated.current || !profile.data || !shouldAutoLocate(origin, permission)) return;
    autoLocated.current = true;
    void locateMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission, profile.data, origin]);

  const favoriteKeys = useMemo(() => new Set((favorites.data ?? []).map((f) => f.id)), [favorites.data]);

  function onToggleFavorite(store: Store, favorite: boolean) {
    setNotice(null);
    toggle.mutate(
      { store, favorite, sortOrder: nextSortOrder(favorites.data ?? []) },
      {
        // Offline: the shared check (src/lib/queryClient.ts) refuses the change; say so in the app's standard words.
        onError: (error) =>
          setNotice(error instanceof DataError && error.kind === 'offline' ? OFFLINE_MESSAGE : STORES_COPY.favoriteFailed(messageOf(error))),
      },
    );
  }

  const visible = useMemo(() => filterStoresList(stores.list, query), [stores.list, query]);
  const focusIsLocal = focusStoreKey != null && stores.list.local.some((s) => favoriteStoreKey(s) === focusStoreKey);

  // A local market tapped in the row sits behind "More local markets": open it.
  useEffect(() => {
    if (focusIsLocal) setShowLocal(true);
  }, [focusIsLocal]);

  function onFocusedLayout(node: View) {
    if (!focusStoreKey || revealed.current === focusStoreKey) return;
    revealed.current = focusStoreKey;
    // After this frame's layout, so the cards above it have their heights.
    setTimeout(() => revealInScroll(node, scrollRef.current, contentRef.current), 50);
  }

  const searching = query.trim().length > 0;
  const total = visible.chains.length + visible.local.length;
  const showPanel = panelOpen || shouldShowLocationPrompt(origin, permission);

  const card = (store: Store) => (
    <StoreCard
      key={store.id}
      store={store}
      favorite={favoriteKeys.has(favoriteStoreKey(store))}
      onToggleFavorite={onToggleFavorite}
      // Not disabled offline: a tap gets the standard offline message (onToggleFavorite).
      disabled={!favorites.data}
      focused={focusStoreKey != null && favoriteStoreKey(store) === focusStoreKey}
      onFocusedLayout={onFocusedLayout}
    />
  );

  let body: ReactNode;
  if (profile.isPending || stores.isPending) {
    body = (
      <View style={{ gap: space.gap }} accessibilityLiveRegion="polite">
        <AppText variant="secondary" color="muted">
          {STORES_COPY.loading}
        </AppText>
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </View>
    );
  } else if (stores.geocodeError) {
    body = (
      <AppText variant="secondary" color="danger">
        {messageOf(stores.geocodeError)}
      </AppText>
    );
  } else if (stores.isError && total === 0) {
    body = (
      <EmptyState icon="wifi-off" title={STORES_COPY.loadFailed}>
        <Button label={STORES_COPY.retry} kind="secondary" onPress={stores.refetch} />
      </EmptyState>
    );
  } else if (total === 0) {
    body = searching ? (
      <EmptyState icon="search" title={STORES_COPY.emptySearch} />
    ) : (
      <EmptyState icon="shopping-bag" title={STORES_COPY.noStoresTitle} hint={`${STORES_COPY.noStores} ${STORES_COPY.noStoresHint}`}>
        {radiusMultiplier === 1 ? <Button label={STORES_COPY.widenSearch} kind="secondary" onPress={() => setRadiusMultiplier(2)} /> : null}
      </EmptyState>
    );
  } else {
    // Saved stores lead, wherever they sit in the list (even among the local markets).
    const savedSplit = partitionSaved([...visible.chains, ...visible.local], (s) => favoriteKeys.has(favoriteStoreKey(s)));
    const savedIds = new Set(savedSplit.saved.map((s) => s.id));
    const chains = visible.chains.filter((s) => !savedIds.has(s.id));
    const local = visible.local.filter((s) => !savedIds.has(s.id));
    // With no recognised store to lead with, hiding everything behind a button would look empty.
    const localOnly = chains.length === 0;
    const localVisible = localOnly || searching || showLocal;
    const showToggle = local.length > 0 && !localOnly && !searching;
    body = (
      <View style={{ gap: space.gap }}>
        {savedSplit.saved.length > 0 ? (
          <>
            <SectionHeading icon="star" label={STORES_COPY.savedHeading} />
            {savedSplit.saved.map(card)}
          </>
        ) : null}
        {chains.length > 0 || local.length > 0 ? <SectionHeading icon="shopping-cart" label={STORES_COPY.nearbyHeading} /> : null}
        {chains.map(card)}
        {showToggle ? (
          <Button
            label={showLocal ? STORES_COPY.hideLocalMarkets : `${STORES_COPY.moreLocalMarkets} (${local.length})`}
            kind="secondary"
            accessibilityState={{ expanded: showLocal }}
            aria-expanded={showLocal}
            onPress={() => setShowLocal((open) => !open)}
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}
        {localVisible && local.length > 0 ? (
          <View style={{ gap: space.gap }}>
            {!localOnly && searching ? (
              <AppText variant="sectionTitle" bold>
                {STORES_COPY.localMarketsHeading}
              </AppText>
            ) : null}
            <AppText variant="secondary" color="muted">
              {STORES_COPY.localMarketsNote}
            </AppText>
            {local.map(card)}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Screen title={title} scrollRef={scrollRef} contentRef={contentRef}>
      {top}
      <View
        style={{
          backgroundColor: colors.banana,
          borderRadius: radius.card,
          padding: space.cardPadding + 4,
          gap: 10,
        }}
      >
        <AppText variant="sectionTitle" display color="onBanana">
          {STORES_COPY.heroTitle}
        </AppText>
        <AppText variant="secondary" color="onBanana">
          {STORES_COPY.heroSub}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: colors.card,
              borderRadius: radius.pill,
              paddingLeft: 12,
              paddingRight: 14,
              minHeight: 36,
              flexShrink: 1,
            }}
          >
            <Feather name="map-pin" size={16} color={colors.ink} accessibilityElementsHidden importantForAccessibility="no" />
            <AppText variant="secondary" bold testID="stores-origin" style={{ flexShrink: 1 }}>
              {STORES_COPY.nearPrefix} {originLabel(origin)}
            </AppText>
          </View>
          <Button
            label={STORES_COPY.changeLocation}
            kind="secondary"
            accessibilityLabel={STORES_COPY.changeLocationA11y}
            onPress={() => setPanelOpen((open) => !open)}
          />
        </View>
      </View>

      {showPanel ? (
        <LocationPanel
          permission={permission}
          initialZip={origin.kind === 'zip' && !origin.isDefault ? origin.zip : (profile.data?.homeZip ?? '')}
          locating={locating}
          busy={locating || saveLocation.isPending || !online}
          error={locationError}
          deniedHelp={locationDeniedHelp}
          onUseLocation={() => void locateMe()}
          onSaveZip={(zip) => void saveZip(zip)}
        />
      ) : null}

      <AppText variant="secondary" color="muted">
        {STORES_COPY.rowNote}
      </AppText>

      <View style={{ justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 16, zIndex: 1 }} pointerEvents="none">
          <Feather name="search" size={18} color={colors.muted} accessibilityElementsHidden importantForAccessibility="no" />
        </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={STORES_COPY.searchPlaceholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={STORES_COPY.searchPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          minHeight: touch.min + 4,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.pill,
          backgroundColor: colors.card,
          paddingLeft: 42,
          paddingRight: 18,
          color: colors.ink,
          fontFamily: fonts.body,
          fontSize: typeScale.body.fontSize,
        }}
      />
      </View>

      {notice ? (
        <AppText variant="secondary" color="danger">
          {notice}
        </AppText>
      ) : null}

      {body}

      <AppText variant="label" color="muted">
        {STORES_COPY.attribution}
      </AppText>
    </Screen>
  );
}

function SectionHeading({ icon, label }: { icon: 'star' | 'shopping-cart'; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <Feather name={icon} size={18} color={colors.ink} accessibilityElementsHidden importantForAccessibility="no" />
      <AppText variant="sectionTitle" bold>
        {label}
      </AppText>
    </View>
  );
}

/** A grey placeholder shaped like a store card, shown while stores load. */
function SkeletonCard() {
  const block = (w: number | `${number}%`, h: number, extra?: object) => (
    <View style={{ width: w, height: h, borderRadius: radius.control, backgroundColor: colors.sand, ...extra }} />
  );
  return (
    <View
      aria-hidden
      style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: space.cardPadding, gap: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {block(56, 56, { borderRadius: 28 })}
        <View style={{ flex: 1, gap: 8 }}>
          {block('60%', 18)}
          {block('35%', 12)}
        </View>
      </View>
      {block('100%', 54, { borderRadius: radius.pill })}
    </View>
  );
}

function EmptyState({ icon, title, hint, children }: { icon: 'wifi-off' | 'search' | 'shopping-bag'; title: string; hint?: string; children?: ReactNode }) {
  return (
    <View
      style={{
        alignItems: 'center',
        gap: 10,
        padding: space.groupGap,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
      }}
    >
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={26} color={colors.ink} accessibilityElementsHidden importantForAccessibility="no" />
      </View>
      <AppText variant="sectionTitle" bold style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {hint ? (
        <AppText variant="secondary" color="muted" style={{ textAlign: 'center' }}>
          {hint}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}
