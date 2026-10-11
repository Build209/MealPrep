import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '../../lib/icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHydrated } from '../../hooks/useHydrated';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Modal } from '../../components/BackAwareModal';
import { Card } from '../../components/Card';
import { CategoryChips } from '../../components/CategoryChips';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PantryFilteredItemList } from '../../components/PantryFilteredItemList';
import { PantryStorageScanButtons } from '../../components/PantryStorageScanButtons';
import { PantryScanReview, PantryScanReviewStickyFooter } from '../../components/PantryScanReview';
import { PantryOverflowMenu } from '../../components/PantryOverflowMenu';
import { PantryScanTip } from '../../components/PantryScanTip';
import {
  PantryStorageLocationChips,
  PantryStorageLocationFilterChips,
} from '../../components/PantryStorageLocationChips';
import { CATEGORY_LABELS, isPantryVisionConfigured, PHOTO_SCAN, THEME } from '../../config/appConfig';
import { GUEST_MODE_COPY } from '../../config/guestMode';
import { PANTRY_SCAN_UI_COPY, readLastPantryScanLocation } from '../../config/pantryScan';
import {
  DEFAULT_PANTRY_STORAGE_LOCATION,
  isPantryStorageLocation,
  labelForPantryStorageLocation,
  PANTRY_LOCATION_FILTER_STORAGE_KEY,
  PANTRY_STORAGE_LOCATIONS,
  previewResortFromDefaultPantry,
  suggestStorageLocationForCategory,
  suggestStorageLocationForPantryItem,
  PANTRY_LIST_COPY,
  type PantryStorageLocation,
} from '../../config/pantryStorage';
import { inferGroceryCategoryFromName } from '../../lib/grocery/categorize';
import { useApp } from '../../context/AppContext';
import { countDefaultKitchenMatches } from '../../config/recipeMatching';
import { buildPantryMatchIndex } from '../../lib/recipeMatch';
import {
  registerAiBaselineEntries,
  reviewItemsToPantryItems,
  mergeSecondScanIntoReview,
} from '../../lib/pantryVision/reviewItems';
import { buildScanCorrectionRows } from '../../lib/scanCorrections/diff';
import {
  logScanCorrectionsInBackground,
  uploadScanTrainingPhoto,
} from '../../lib/scanCorrections/client';
import { createScanSessionId } from '../../lib/scanCorrections/session';
import { countPantryItemsForLocationFilters, countPantryItemsInLocation } from '../../lib/pantryGrouping';
import {
  consumeOpenPantryShelfScanRequest,
  consumePantryWebShelfScanFile,
  subscribeOpenPantryShelfScan,
} from '../../lib/pantry/openShelfScanRequest';
import {
  MAX_PARALLEL_SCANS,
  canStartAnotherScan,
  placeScanResult,
  resetScanActivity,
  setScanReviewReady,
  setScanningCount,
} from '../../lib/pantry/scanActivity';
import {
  consumePantryExpiringHighlightRequest,
  subscribePantryExpiringHighlight,
} from '../../lib/pantry/openExpiringHighlightRequest';
import { readJson, writeJson } from '../../lib/storage';
import { logUsageEvent } from '../../lib/usage/usageLog';
import { notePurchasedToday } from '../../lib/usual/usualItems';
import { logPantryScanFailure } from '../../lib/pantryVision/scanLog';
import { PantryImageQualityError } from '../../lib/pantryVision/prepareImageShared';
import type { PantryScanReviewItem, PreparedPantryImage } from '../../lib/pantryVision/types';
import type { PantryScanKind } from '../../lib/pantryVision/client';
import { useFreeScanAllowance } from '../../hooks/useFreeScanAllowance';
import { freeScansUsedFromServer } from '../../lib/pantry/freeScanAllowance';
import { hasPlusPhotoScanAccess, PLANS_COPY } from '../../config/plans';
import {
  shouldBlockGuestPantryPhotoScan,
  shouldDeferPantryPhotoScanForAuth,
} from '../../lib/guest/pantryPhotoScanGate';
import { resolvePhotoScanAccess } from '../../lib/guest/resolvePhotoScanAccess';
import { photoScanPlanBlockedMessage } from '../../lib/plans/photoScanPlanBlockedMessage';
import {
  photoScanAccessState,
  photoScanAccessUserMessage,
  shouldDeferPhotoScanForProfile,
} from '../../lib/plans/photoScanAccess';
import { uploadScanPhoto } from '../../lib/scanPhotos/client';
import { TabEmptyState } from '../../components/TabEmptyState';
import { ViewScanPhotoButton } from '../../components/ViewScanPhotoButton';
import { PANTRY_CATEGORIES, type PantryCategory, type PantryItem } from '../../types/mealprep';
import { MAIN_INGREDIENT_COPY } from '../../config/mainIngredient';
import { APP_ROUTES } from '../../config/appRoutes';
import {
  PANTRY_STAPLES_COPY,
  readPantryStaplesPromptDismissed,
  writePantryStaplesPromptDismissed,
} from '../../config/pantryStaples';
import { PantryAddStaplesLink } from '../../components/pantry/PantryAddStaplesLink';
import { PantryStaplesInviteCard } from '../../components/pantry/PantryStaplesInviteCard';
import { PantryShelves } from '../../components/pantry/PantryShelves';
import { useTutorialState } from '../../hooks/useTutorial';
import {
  buildPantryShelves,
  DEFAULT_PANTRY_VIEW_MODE,
  isPantryViewMode,
  pantryShelfSummary,
  PANTRY_VIEW_MODE_STORAGE_KEY,
  resolveShelfPlace,
  SHELF_PLACES,
  SHELF_VIEW_COPY,
  type PantryShelf,
  type PantryViewMode,
} from '../../lib/pantry/shelfView';
import { addDaysToIsoDate, todayIsoDate } from '../../lib/pantry/expiry';
import { STAPLE_EXPIRY_QUICK_CHIPS } from '../../lib/pantry/stapleCatalog';

/** 'loading' is no longer set: scans run in the background and are counted in `activeScans`. */
type ScanPhase = 'idle' | 'loading' | 'review';

type PantryConfirmAction =
  | { kind: 'delete-item'; item: PantryItem }
  | { kind: 'clear-location'; location: PantryStorageLocation; count: number }
  | { kind: 'clear-all'; count: number }
  | { kind: 'resort'; toFridge: number; toSpiceRack: number };

function readStoredPantryLocationFilter(): PantryStorageLocation | 'all' {
  const saved = readJson<string | null>(PANTRY_LOCATION_FILTER_STORAGE_KEY, null);
  if (saved === 'all') return 'all';
  if (saved && isPantryStorageLocation(saved)) return saved;
  return 'all';
}

function readStoredPantryViewMode(): PantryViewMode {
  const saved = readJson<string | null>(PANTRY_VIEW_MODE_STORAGE_KEY, null);
  return isPantryViewMode(saved) ? saved : DEFAULT_PANTRY_VIEW_MODE;
}

export default function PantryScreen() {
  const {
    pantry,
    recipes,
    featureFlags,
    demoMode,
    authReady,
    profile,
    profileReady,
    session,
    savePantryScanReview,
    userPreferences,
    setUserPreference,
    grocery,
    markGroceryItemsBought,
    showNotice,
    addManualPantryItem,
    updatePantryItemEntry,
    deletePantryItemEntry,
    clearPantryLocation,
    clearAllPantry,
    resortPantryItemsInDefaultLocation,
    openAuthSheet,
    isAdmin,
  } = useApp();
  const [filter, setFilter] = useState<PantryCategory | 'all'>('all');
  const hydrated = useHydrated();
  const [locationFilterOverride, setLocationFilterOverride] = useState<PantryStorageLocation | 'all' | null>(
    null,
  );
  const locationFilter: PantryStorageLocation | 'all' = hydrated
    ? (locationFilterOverride ?? readStoredPantryLocationFilter())
    : 'all';

  /** Shelves (packages on shelves, one place at a time) or the plain list. Remembered on the device. */
  const [viewModeOverride, setViewModeOverride] = useState<PantryViewMode | null>(null);
  const viewMode: PantryViewMode = hydrated
    ? (viewModeOverride ?? readStoredPantryViewMode())
    : DEFAULT_PANTRY_VIEW_MODE;
  /** Shelves view tucks the two scan cards behind the camera button; this opens them. */
  const [scanPanelOpen, setScanPanelOpen] = useState(false);
  const tutorial = useTutorialState();

  const [phase, setPhaseState] = useState<ScanPhase>('idle');
  /** Same value as `phase`, readable from a scan that started before the latest render. */
  const phaseRef = useRef<ScanPhase>('idle');
  function setPhase(next: ScanPhase) {
    phaseRef.current = next;
    setPhaseState(next);
  }
  /** Photos currently with the model. Several can run at once while the app stays usable. */
  const [activeScans, setActiveScans] = useState(0);
  const activeScansRef = useRef(0);
  function beginScan() {
    activeScansRef.current += 1;
    setActiveScans(activeScansRef.current);
    setScanningCount(activeScansRef.current);
  }
  function endScan() {
    activeScansRef.current = Math.max(0, activeScansRef.current - 1);
    setActiveScans(activeScansRef.current);
    setScanningCount(activeScansRef.current);
  }
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<PantryScanReviewItem[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanErrorTitle, setScanErrorTitle] = useState<string | null>(null);
  const [scanGuestSignInCta, setScanGuestSignInCta] = useState(false);
  const [scanNotice, setScanNotice] = useState<{ title: string; message: string } | null>(null);
  const [scanQualityWarning, setScanQualityWarning] = useState<string | null>(null);
  /** Across the photos in the open list: how many items the scans found, and how many were already owned. */
  const [scanSummary, setScanSummary] = useState<{ found: number; already: number; receipt?: boolean } | null>(null);
  /** The open list includes a receipt: saving also ticks matching grocery rows, and "Add another photo" reads a receipt. */
  const reviewHasReceiptRef = useRef(false);
  /** Kind of the most recent scan attempt, for "Try again". */
  const lastAttemptKindRef = useRef<PantryScanKind>('shelf');
  const [lastScanAttempt, setLastScanAttempt] = useState<
    | { kind: 'prepared'; prepared: PreparedPantryImage; location: PantryStorageLocation }
    | { kind: 'uri'; uri: string; location: PantryStorageLocation }
    | null
  >(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [modelLabel, setModelLabel] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<PantryItem | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualUnit, setManualUnit] = useState('each');
  const [manualCategory, setManualCategory] = useState<PantryCategory>('produce');
  const [manualLocation, setManualLocation] = useState<PantryStorageLocation>(DEFAULT_PANTRY_STORAGE_LOCATION);
  // Add sheet only: once the user picks a category or a storage place by hand, typing no longer changes it.
  const [manualCategoryPicked, setManualCategoryPicked] = useState(false);
  const [manualLocationPicked, setManualLocationPicked] = useState(false);
  const [confirmAction, setConfirmAction] = useState<PantryConfirmAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [manualExpiresOn, setManualExpiresOn] = useState<string | null>(null);
  const [manualExpiryInputOpen, setManualExpiryInputOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scanLocationHint, setScanLocationHint] = useState<PantryStorageLocation>(
    readLastPantryScanLocation(),
  );
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [staplesInviteDismissed, setStaplesInviteDismissed] = useState(() =>
    readPantryStaplesPromptDismissed(),
  );
  const [scanRecipeCount, setScanRecipeCount] = useState<number | null>(null);
  const [autoOpenScanMode, setAutoOpenScanMode] = useState<'menu' | 'camera' | null>(null);
  const [highlightItemIds, setHighlightItemIds] = useState<Set<string>>(() => new Set());
  const [pendingScanPhotoPath, setPendingScanPhotoPath] = useState<string | null>(null);
  const pantryScanUploadRef = useRef<Promise<string | null> | null>(null);
  const scanSessionIdRef = useRef<string | null>(null);
  const aiBaselineRef = useRef<Map<string, { aiName: string }>>(new Map());

  async function processWebShelfScanFile(file: File) {
    const scanLocation = readLastPantryScanLocation();
    try {
      const { preparePantryImageFromFile } = await import('../../lib/pantryVision/prepareImage.web');
      const prepared = await preparePantryImageFromFile(file, { detailTiles: true });
      setScanLocationHint(scanLocation);
      await runVisionFromPrepared(prepared, scanLocation);
    } catch (error) {
      if (error instanceof PantryImageQualityError && error.reason === 'blank') {
        handleWebPrepareError(error.message);
        return;
      }
      const message = error instanceof Error ? error.message : 'Could not prepare photo';
      handleWebPrepareError(message);
    }
  }

  const tryConsumeExpiringHighlight = useCallback(() => {
    const ids = consumePantryExpiringHighlightRequest();
    if (!ids?.length) return;
    setHighlightItemIds(new Set(ids));
    selectLocationFilter('all');
    setFilter('all');
    // The highlight is drawn on list rows; this visit only, the saved view choice is untouched.
    setViewModeOverride('list');
  }, []);

  const tryConsumeShelfScanRequest = useCallback(() => {
    const webFile = consumePantryWebShelfScanFile();
    if (webFile) {
      if (phase !== 'idle') return;
      void processWebShelfScanFile(webFile);
      return;
    }
    const mode = consumeOpenPantryShelfScanRequest();
    if (!mode) return;
    if (phase !== 'idle') return;
    setScanPanelOpen(true);
    setAutoOpenScanMode(mode);
  }, [phase]);

  useFocusEffect(
    useCallback(() => {
      tryConsumeExpiringHighlight();
      tryConsumeShelfScanRequest();
    }, [tryConsumeExpiringHighlight, tryConsumeShelfScanRequest]),
  );

  useEffect(() => {
    return subscribeOpenPantryShelfScan(() => {
      tryConsumeShelfScanRequest();
    });
  }, [tryConsumeShelfScanRequest]);

  useEffect(() => {
    return subscribePantryExpiringHighlight(() => {
      tryConsumeExpiringHighlight();
    });
  }, [tryConsumeExpiringHighlight]);

  useEffect(() => {
    tryConsumeExpiringHighlight();
    tryConsumeShelfScanRequest();
  }, [phase, tryConsumeExpiringHighlight, tryConsumeShelfScanRequest]);

  // Lets the tab bar show that a list is waiting while the shopper is on another tab.
  useEffect(() => {
    setScanReviewReady(phase === 'review');
  }, [phase]);
  useEffect(() => () => resetScanActivity(), []);

  const visionReady = isPantryVisionConfigured();
  const accessToken = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;

  const photoScanGate = useMemo(
    () => ({
      demoMode,
      authReady,
      hasSession: Boolean(session),
    }),
    [authReady, demoMode, session],
  );

  /** The plan gate on its own, before this month's free scans are taken into account. */
  const plusOnlyScanAccess = useMemo(
    () => ({
      ...photoScanGate,
      plan: profile.plan,
      role: profile.role,
      profileReady,
    }),
    [photoScanGate, profile.plan, profile.role, profileReady],
  );

  const isPlusForScans = hasPlusPhotoScanAccess(profile.plan, profile.role);
  const freeScans = useFreeScanAllowance({
    userId,
    enabled: !demoMode && Boolean(session) && profileReady && !isPlusForScans,
  });

  /** Scan gate for shelves and receipts: a paid plan, or a free account with free scans left this month. */
  const photoScanAccess = useMemo(
    () => ({ ...plusOnlyScanAccess, freeScansRemaining: freeScans.remaining }),
    [freeScans.remaining, plusOnlyScanAccess],
  );

  const locationCounts = useMemo(
    () =>
      Object.fromEntries(
        PANTRY_STORAGE_LOCATIONS.map((location) => [location, countPantryItemsInLocation(pantry, location)]),
      ) as Record<PantryStorageLocation, number>,
    [pantry],
  );

  const locationFilterCounts = useMemo(
    () => countPantryItemsForLocationFilters(pantry, filter),
    [filter, pantry],
  );

  function selectLocationFilter(next: PantryStorageLocation | 'all') {
    setLocationFilterOverride(next);
    writeJson(PANTRY_LOCATION_FILTER_STORAGE_KEY, next);
  }

  function selectViewMode(next: PantryViewMode) {
    setViewModeOverride(next);
    writeJson(PANTRY_VIEW_MODE_STORAGE_KEY, next);
  }

  const shelfPlace = resolveShelfPlace(locationFilter, pantry);
  const shelves = useMemo(() => buildPantryShelves(pantry, shelfPlace), [pantry, shelfPlace]);
  const shelfSummary = useMemo(() => pantryShelfSummary(pantry), [pantry]);

  /** "See all" on a shelf: the same items as plain rows, in the list view. */
  function openShelfInList(shelf: PantryShelf) {
    selectLocationFilter(shelf.seeAll.location);
    setFilter(shelf.seeAll.category);
    setViewModeOverride('list');
  }

  const resortPreview = useMemo(() => previewResortFromDefaultPantry(pantry), [pantry]);

  function clearScanFailure() {
    setScanError(null);
    setScanErrorTitle(null);
    setScanGuestSignInCta(false);
    setScanNotice(null);
    setScanQualityWarning(null);
    setLastScanAttempt(null);
  }

  function setScanNoItemsFound(
    attempt:
      | { kind: 'prepared'; prepared: PreparedPantryImage; location: PantryStorageLocation }
      | { kind: 'uri'; uri: string; location: PantryStorageLocation },
  ) {
    setScanError(null);
    setScanErrorTitle(null);
    setScanNotice({
      title: PHOTO_SCAN.noItemsFoundTitle,
      message: PHOTO_SCAN.noItemsFoundMessage,
    });
    setLastScanAttempt(attempt);
  }

  function setScanFailure(
    message: string,
    title: string,
    attempt:
      | { kind: 'prepared'; prepared: PreparedPantryImage; location: PantryStorageLocation }
      | { kind: 'uri'; uri: string; location: PantryStorageLocation }
      | null,
    options?: { signInCta?: boolean },
  ) {
    setScanNotice(null);
    setScanError(message);
    setScanErrorTitle(title);
    setLastScanAttempt(attempt);
    setScanGuestSignInCta(Boolean(options?.signInCta));
  }

  function retryLastScan() {
    if (!lastScanAttempt) return;
    const kind = lastAttemptKindRef.current;
    if (lastScanAttempt.kind === 'prepared') {
      void runVisionFromPrepared(lastScanAttempt.prepared, lastScanAttempt.location, { kind });
      return;
    }
    void runVisionFromUri(lastScanAttempt.uri, lastScanAttempt.location, kind);
  }

  async function runVisionFromPrepared(
    prepared: PreparedPantryImage,
    scanLocation: PantryStorageLocation,
    options?: { mergeIntoReview?: boolean; kind?: PantryScanKind },
  ) {
    const scanKind: PantryScanKind = options?.kind ?? 'shelf';
    const isReceipt = scanKind === 'receipt';
    if (!featureFlags.photoScan) {
      const message = 'Photo pantry scan is turned off. An admin can re-enable it in feature toggles.';
      if (Platform.OS === 'web') {
        setScanFailure(message, 'Feature turned off', null);
      } else {
        Alert.alert('Feature turned off', message);
      }
      return;
    }
    const { access, session: scanSession } = await resolvePhotoScanAccess(
      photoScanAccess,
      session,
    );
    if (access !== 'allowed') {
      const copy = photoScanAccessUserMessage(access);
      if (access === 'guest_blocked' && Platform.OS !== 'web') {
        promptGuestPhotoScanSignIn();
      }
      if (copy) {
        setScanFailure(copy.message, copy.title, null);
      }
      return;
    }

    const scanAccessToken = scanSession?.access_token ?? accessToken;
    const scanUserId = scanSession?.user?.id ?? userId;

    if (!canStartAnotherScan(activeScansRef.current)) {
      const message = PANTRY_SCAN_UI_COPY.tooManyScans(MAX_PARALLEL_SCANS);
      if (phaseRef.current === 'review') setSaveError(message);
      else setScanFailure(message, PANTRY_SCAN_UI_COPY.tooManyScansTitle, null);
      return;
    }

    setScanLocationHint(scanLocation);
    clearScanFailure();
    setScanQualityWarning(prepared.qualityWarnings?.join(' ') ?? null);
    setSaveError(null);
    setPreviewUri(prepared.uri);
    // The scan runs in the background from here: the screen stays usable and more photos can be added.
    beginScan();

    const attempt = { kind: 'prepared' as const, prepared, location: scanLocation };
    lastAttemptKindRef.current = scanKind;

    const pantryVisionClient = await import('../../lib/pantryVision/client');

    // A receipt photo is never kept: it is sent for reading and nothing is stored.
    if (!isReceipt) {
      setPendingScanPhotoPath(null);
      if (scanUserId) {
        const uploadPromise = uploadScanPhoto(prepared, 'pantry', scanUserId);
        pantryScanUploadRef.current = uploadPromise;
        void uploadPromise.then(setPendingScanPhotoPath);
      } else {
        pantryScanUploadRef.current = null;
      }
    }

    try {
      const { detectionsToReviewItems, summarizeScanAgainstPantry } = await import('../../lib/pantryVision/reviewItems');
      const result = await pantryVisionClient.analyzePantryPhoto(prepared, scanAccessToken, {
        scanLocation,
        bypassCache: options?.mergeIntoReview,
        kind: scanKind,
      });
      const freeUsed = freeScansUsedFromServer(result.usage);
      if (freeUsed != null) {
        freeScans.setUsed(freeUsed);
        const left = result.usage?.remaining ?? 0;
        showNotice(left > 0 ? PLANS_COPY.freeScansLeftNote(left) : PLANS_COPY.freeScansUsedNote);
      }
      // A receipt keeps items already owned: more was bought, and saving adds to the existing row.
      const reviewOptions = { includeAlreadyInPantry: isReceipt };
      const rows = detectionsToReviewItems(
        result.items,
        pantry,
        recipes,
        isReceipt ? null : prepared.uri,
        demoMode,
        scanLocation,
        reviewOptions,
      );
      const summary = summarizeScanAgainstPantry(result.items, pantry);
      // Decided when the answer arrives, not when the photo was taken: an earlier photo may
      // have opened the list in the meantime, and this one's items then join it.
      const placement = placeScanResult({
        reviewOpen: phaseRef.current === 'review',
        newItemCount: rows.length,
        othersScanning: Math.max(0, activeScansRef.current - 1),
      });
      if (placement === 'merge-into-review') {
        setScanSummary((prev) => ({
          found: (prev?.found ?? 0) + summary.found,
          already: (prev?.already ?? 0) + summary.alreadyInPantry,
          receipt: Boolean(prev?.receipt) || isReceipt,
        }));
        if (isReceipt && rows.length > 0) reviewHasReceiptRef.current = true;
        if (rows.length === 0) {
          setSaveError(
            summary.found > 0
              ? PANTRY_SCAN_UI_COPY.allAlreadyInPantry(summary.found)
              : PANTRY_SCAN_UI_COPY.noNewItemsInPhoto,
          );
        } else {
          setReviewItems((prev) => {
            const merged = mergeSecondScanIntoReview(prev, result.items, pantry, recipes, scanLocation, reviewOptions);
            registerAiBaselineEntries(merged, aiBaselineRef.current);
            return merged;
          });
          setModelLabel(result.model);
          setPreviewUri(prepared.uri);
        }
        setLastScanAttempt(attempt);
        return;
      }
      if (placement === 'nothing-found' || placement === 'nothing-found-quiet') {
        if (summary.found > 0) {
          // The scan worked: everything it saw is already owned. Say that, not "try a closer shot".
          setScanError(null);
          setScanErrorTitle(null);
          setLastScanAttempt(null);
          setScanNotice({
            title: PANTRY_SCAN_UI_COPY.allAlreadyInPantryTitle,
            message: PANTRY_SCAN_UI_COPY.allAlreadyInPantry(summary.found),
          });
          return;
        }
        logPantryScanFailure('EMPTY_DETECTIONS');
        if (placement === 'nothing-found') {
          setScanNoItemsFound(attempt);
          if (isReceipt) {
            setScanNotice({
              title: PANTRY_SCAN_UI_COPY.receiptNothingFoundTitle,
              message: PANTRY_SCAN_UI_COPY.receiptNothingFound,
            });
          }
        }
        return;
      }
      setScanSummary({ found: summary.found, already: summary.alreadyInPantry, receipt: isReceipt });
      reviewHasReceiptRef.current = isReceipt;
      clearScanFailure();
      setLastScanAttempt(attempt);
      setModelLabel(result.model);
      scanSessionIdRef.current = createScanSessionId();
      aiBaselineRef.current = new Map();
      registerAiBaselineEntries(rows, aiBaselineRef.current);
      setReviewItems(rows);
      setPhase('review');
    } catch (error) {
      const {
        PantryVisionAuthError,
        PantryVisionNotConfiguredError,
        PantryVisionPlanRequiredError,
        PantryVisionRateLimitError,
        PantryVisionScanError,
        PantryVisionUnavailableError,
      } = pantryVisionClient;
      const title =
        error instanceof PantryVisionUnavailableError
          ? PHOTO_SCAN.scanUnavailableTitle
          : error instanceof PantryVisionRateLimitError
          ? 'Too many scans'
          : error instanceof PantryVisionAuthError
            ? 'Sign in required'
            : error instanceof PantryVisionPlanRequiredError
              ? photoScanPlanBlockedMessage().title
              : error instanceof PantryVisionNotConfiguredError
                ? 'Scan not set up'
                : PHOTO_SCAN.scanFailedTitle;
      const message =
        error instanceof PantryVisionNotConfiguredError
          ? error.message
          : error instanceof PantryVisionAuthError
            ? error.message
            : error instanceof PantryVisionPlanRequiredError
              ? error.message
              : error instanceof PantryVisionRateLimitError
                ? error.message
                : error instanceof PantryVisionScanError
                  ? error.message
                  : error instanceof Error
                    ? error.message
                    : PHOTO_SCAN.scanFailedMessage;
      const canRetry = !(error instanceof PantryVisionNotConfiguredError);
      if (error instanceof PantryVisionPlanRequiredError) freeScans.refresh();
      if (phaseRef.current === 'review') {
        // A list from another photo is open: report beside it and leave the list alone.
        setSaveError(message);
      } else {
        setScanFailure(message, title, canRetry ? attempt : null);
      }
    } finally {
      endScan();
    }
  }

  async function runVisionFromUri(
    uri: string,
    scanLocation: PantryStorageLocation,
    kind: PantryScanKind = 'shelf',
  ) {
    lastAttemptKindRef.current = kind;
    clearScanFailure();
    setPreviewUri(uri);
    const attempt = { kind: 'uri' as const, uri, location: scanLocation };
    try {
      const { preparePantryImage } = await import('../../lib/pantryVision/prepareImage');
      const prepared = await preparePantryImage(uri, { detailTiles: kind === 'receipt' ? 'receipt' : true });
      await runVisionFromPrepared(prepared, scanLocation, { kind });
    } catch (error) {
      if (error instanceof PantryImageQualityError && error.reason === 'blank') {
        logPantryScanFailure('BAD_IMAGE', error.message);
        setScanFailure(error.message, PHOTO_SCAN.scanFailedTitle, attempt);
      } else if (error instanceof Error) {
        logPantryScanFailure('BAD_IMAGE', error.message);
        setScanFailure(PHOTO_SCAN.scanFailedMessage, PHOTO_SCAN.scanFailedTitle, attempt);
      } else {
        logPantryScanFailure('UNKNOWN');
        setScanFailure(PHOTO_SCAN.scanFailedMessage, PHOTO_SCAN.scanFailedTitle, attempt);
      }
    }
  }

  async function handleAddAnotherPhotoFromReview() {
    const scanLocation = scanLocationHint;
    // A long receipt is often two photos: the next photo of a receipt list is read as a receipt too.
    const kind: PantryScanKind = reviewHasReceiptRef.current ? 'receipt' : 'shelf';
    const detailTiles = kind === 'receipt' ? ('receipt' as const) : true;
    if (Platform.OS === 'web') {
      try {
        const { pickWebImageFile } = await import('../../lib/web/pickWebImageFile');
        const { preparePantryImageFromFile } = await import('../../lib/pantryVision/prepareImage.web');
        const file = await pickWebImageFile();
        if (!file) return;
        const prepared = await preparePantryImageFromFile(file, { detailTiles });
        await runVisionFromPrepared(prepared, scanLocation, { mergeIntoReview: true, kind });
      } catch (error) {
        if (error instanceof PantryImageQualityError && error.reason === 'blank') {
          setSaveError(error.message);
        } else {
          setSaveError(PHOTO_SCAN.scanFailedMessage);
        }
      }
      return;
    }
    Alert.alert(PANTRY_SCAN_UI_COPY.choosePhotoSourceTitle, PANTRY_SCAN_UI_COPY.choosePhotoSourceMessage, [
      {
        text: PANTRY_SCAN_UI_COPY.takePhoto,
        onPress: () => void pickNativePhotoAndMerge(scanLocation, 'camera', kind),
      },
      {
        text: PANTRY_SCAN_UI_COPY.chooseFromLibrary,
        onPress: () => void pickNativePhotoAndMerge(scanLocation, 'library', kind),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function pickNativePhotoAndMerge(
    scanLocation: PantryStorageLocation,
    source: 'camera' | 'library',
    kind: PantryScanKind = 'shelf',
  ) {
    const detailTiles = kind === 'receipt' ? ('receipt' as const) : true;
    const { access } = await resolvePhotoScanAccess(
      photoScanAccess,
      session,
    );
    if (access !== 'allowed') {
      const copy = photoScanAccessUserMessage(access);
      if (copy) setSaveError(copy.message);
      return;
    }
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setSaveError(PHOTO_SCAN.cameraPermissionMessage);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: PHOTO_SCAN.jpegQuality,
      });
      if (result.canceled || !result.assets[0]) return;
      const { preparePantryImage } = await import('../../lib/pantryVision/prepareImage');
      const prepared = await preparePantryImage(result.assets[0].uri, { detailTiles });
      await runVisionFromPrepared(prepared, scanLocation, { mergeIntoReview: true, kind });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: PHOTO_SCAN.jpegQuality,
    });
    if (result.canceled || !result.assets[0]) return;
    const { preparePantryImage } = await import('../../lib/pantryVision/prepareImage');
    const prepared = await preparePantryImage(result.assets[0].uri, { detailTiles });
    await runVisionFromPrepared(prepared, scanLocation, { mergeIntoReview: true, kind });
  }

  function promptGuestPhotoScanSignIn() {
    setScanFailure(GUEST_MODE_COPY.pantryScanSignIn, GUEST_MODE_COPY.pantryScanSignInTitle, null, {
      signInCta: true,
    });
  }

  function handleWebPrepareError(message: string) {
    setScanFailure(message, PHOTO_SCAN.scanFailedTitle, null);
  }

  async function handleNativeScan(source: 'camera' | 'library', kind: PantryScanKind = 'shelf') {
    const scanLocation = readLastPantryScanLocation();
    const { access } = await resolvePhotoScanAccess(
      photoScanAccess,
      session,
    );
    if (access !== 'allowed') {
      const copy = photoScanAccessUserMessage(access);
      if (access === 'guest_blocked') {
        promptGuestPhotoScanSignIn();
        return;
      }
      if (copy) {
        setScanFailure(copy.message, copy.title, null);
      }
      return;
    }
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        if (Platform.OS === 'web') {
          setScanFailure(PHOTO_SCAN.cameraPermissionMessage, PHOTO_SCAN.scanFailedTitle, null);
        } else {
          Alert.alert('Camera', PHOTO_SCAN.cameraPermissionMessage);
        }
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: PHOTO_SCAN.jpegQuality,
      });
      if (result.canceled || !result.assets[0]) return;
      await runVisionFromUri(result.assets[0].uri, scanLocation, kind);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: PHOTO_SCAN.jpegQuality,
    });
    if (result.canceled || !result.assets[0]) return;
    await runVisionFromUri(result.assets[0].uri, scanLocation, kind);
  }

  /**
   * The Scan button beside "Add item" (shelves view) and "Scan a receipt" in the menu: straight
   * to the photo picker, no card to open first. Someone who may not scan (guest, free plan with
   * no scans left) gets the scan cards instead, which explain why and offer sign-in or Plus.
   */
  async function handleQuickScan(receipt: boolean) {
    if (!featureFlags.photoScan) return;
    const kind: PantryScanKind = receipt ? 'receipt' : 'shelf';
    const { access } = await resolvePhotoScanAccess(photoScanAccess, session);
    if (access !== 'allowed') {
      setScanPanelOpen(true);
      if (!receipt) setAutoOpenScanMode('menu');
      return;
    }
    if (Platform.OS !== 'web') {
      Alert.alert(PANTRY_SCAN_UI_COPY.choosePhotoSourceTitle, PANTRY_SCAN_UI_COPY.choosePhotoSourceMessage, [
        { text: PANTRY_SCAN_UI_COPY.takePhoto, onPress: () => void handleNativeScan('camera', kind) },
        { text: PANTRY_SCAN_UI_COPY.chooseFromLibrary, onPress: () => void handleNativeScan('library', kind) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    try {
      const { pickWebImageFile } = await import('../../lib/web/pickWebImageFile');
      const { preparePantryImageFromFile } = await import('../../lib/pantryVision/prepareImage.web');
      // No forced camera: the phone offers its own "take photo or choose one" sheet.
      const file = await pickWebImageFile();
      if (!file) return;
      const prepared = await preparePantryImageFromFile(file, { detailTiles: receipt ? 'receipt' : true });
      // A shelf photo taken while looking at the Refrigerator shelves is a fridge photo.
      const location = receipt ? readLastPantryScanLocation() : shelfPlace;
      setScanLocationHint(location);
      await runVisionFromPrepared(prepared, location, { kind });
    } catch (error) {
      handleWebPrepareError(error instanceof Error ? error.message : 'Could not prepare photo');
    }
  }

  function submitScanCorrectionsFeedback() {
    if (demoMode || !session?.user?.id || !scanSessionIdRef.current) return;

    const scanId = scanSessionIdRef.current;
    const model = modelLabel;
    const baseline = aiBaselineRef.current;
    const finalItems = reviewItems;
    const shareTraining = userPreferences.shareScanPhotoForTraining;
    const prepared =
      lastScanAttempt?.kind === 'prepared' ? lastScanAttempt.prepared : null;
    const userId = session.user.id;

    const persist = (trainingPhotoPath: string | null) => {
      const rows = buildScanCorrectionRows({
        scanId,
        model,
        baseline,
        finalItems,
        trainingPhotoPath,
      });
      logScanCorrectionsInBackground(rows);
    };

    if (shareTraining && prepared) {
      void uploadScanTrainingPhoto(prepared, userId, scanId).then(persist);
    } else {
      persist(null);
    }
  }

  async function handleSaveReview() {
    setSaving(true);
    setSaveError(null);
    try {
      const mergedPantry = [...reviewItemsToPantryItems(reviewItems), ...pantry];
      const recipeCount = countDefaultKitchenMatches(
        buildPantryMatchIndex(recipes, mergedPantry).ranked,
        mergedPantry.length,
      );
      let scanPhotoPath = pendingScanPhotoPath;
      if (!scanPhotoPath && pantryScanUploadRef.current) {
        scanPhotoPath = await pantryScanUploadRef.current;
      }
      await savePantryScanReview(reviewItems, scanPhotoPath, scanLocationHint);
      logUsageEvent('scan_saved', {
        kind: reviewHasReceiptRef.current ? 'receipt' : 'shelf',
        count: reviewItems.length,
      });
      if (reviewHasReceiptRef.current) {
        // A receipt is a shopping trip: remember what was bought for "Your usuals".
        notePurchasedToday(reviewItems.filter((item) => item.enabled));
        // What was bought is now in the pantry, so the matching grocery rows are done.
        const { groceryIdsBoughtOnReceipt } = await import('../../lib/pantryVision/reviewItems');
        const boughtIds = groceryIdsBoughtOnReceipt(reviewItems, grocery);
        if (boughtIds.length > 0) {
          markGroceryItemsBought(boughtIds);
          showNotice(PANTRY_SCAN_UI_COPY.groceryTickedOff(boughtIds.length));
        }
      }
      reviewHasReceiptRef.current = false;
      submitScanCorrectionsFeedback();
      setPhase('idle');
      setReviewItems([]);
      setScanSummary(null);
      setPreviewUri(null);
      setPendingScanPhotoPath(null);
      scanSessionIdRef.current = null;
      aiBaselineRef.current = new Map();
      clearScanFailure();
      setSaveError(null);
      setScanPanelOpen(false);
      setScanRecipeCount(recipeCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save pantry items';
      setSaveError(message);
      if (Platform.OS !== 'web') {
        Alert.alert('Save failed', message);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancelReview() {
    setPhase('idle');
    setReviewItems([]);
    setScanSummary(null);
    reviewHasReceiptRef.current = false;
    setPreviewUri(null);
    setPendingScanPhotoPath(null);
    scanSessionIdRef.current = null;
    aiBaselineRef.current = new Map();
    setScanLocationHint(DEFAULT_PANTRY_STORAGE_LOCATION);
  }

  function resetManualForm() {
    setManualName('');
    setManualQty('1');
    setManualUnit('each');
    setManualCategory('produce');
    setManualLocation(suggestStorageLocationForCategory('produce'));
    setManualCategoryPicked(false);
    setManualLocationPicked(false);
    setManualExpiresOn(null);
    setManualExpiryInputOpen(false);
  }

  /**
   * Typing a name in the Add sheet. Clears the "Enter an item name." error (it used to stay up
   * after a name was typed) and, for a new item, moves the Category and Storage chips to where
   * the name suggests, so the sheet shows what will be saved. A choice made by hand is kept.
   */
  function handleManualNameChange(text: string) {
    setManualName(text);
    if (formError) setFormError(null);
    if (editItem) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const category = manualCategoryPicked ? manualCategory : inferGroceryCategoryFromName(trimmed);
    if (!manualCategoryPicked) setManualCategory(category);
    if (!manualLocationPicked) setManualLocation(suggestStorageLocationForPantryItem(trimmed, category));
  }

  function openAddModal() {
    resetManualForm();
    setEditItem(null);
    setAddOpen(true);
  }

  function cookWithPantryItem(item: PantryItem) {
    closeManualModal();
    router.push({
      pathname: '/',
      params: { search: item.name.trim() },
    });
  }

  function openEditModal(item: PantryItem) {
    setEditItem(item);
    setManualName(item.name);
    setManualQty(String(item.quantity));
    setManualUnit(item.unit);
    setManualCategory(item.category);
    setManualLocation(item.location);
    setManualExpiresOn(item.expiresOn);
    setManualExpiryInputOpen(Boolean(item.expiresOn));
    setAddOpen(true);
  }

  function openPantryStaples() {
    router.push(APP_ROUTES.pantryStaples);
  }

  function dismissStaplesInvite() {
    writePantryStaplesPromptDismissed(true);
    setStaplesInviteDismissed(true);
  }

  function closeManualModal() {
    setAddOpen(false);
    setEditItem(null);
    setFormError(null);
  }

  async function submitManualForm() {
    const qty = Number.parseFloat(manualQty);
    if (!manualName.trim()) {
      setFormError('Enter an item name.');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('Enter a valid quantity.');
      return;
    }
    setFormError(null);
    try {
      if (editItem) {
        await updatePantryItemEntry({
          ...editItem,
          name: manualName.trim(),
          quantity: qty,
          unit: manualUnit.trim() || 'each',
          category: manualCategory,
          location: manualLocation,
          expiresOn: manualExpiresOn,
        });
      } else {
        const trimmedName = manualName.trim();
        // The chips follow the name as it is typed (handleManualNameChange) and can be changed by
        // hand, so what is saved is what the sheet shows. Before, the chips were ignored here and
        // the item was filed by its name alone, whatever the user had picked.
        await addManualPantryItem({
          name: trimmedName,
          quantity: qty,
          unit: manualUnit.trim() || 'each',
          category: manualCategory,
          location: manualLocation,
          expiresOn: manualExpiresOn,
        });
        // Shelves show one place at a time: go to where the new item landed so it is seen.
        if (viewMode === 'shelves') selectLocationFilter(manualLocation);
      }
      closeManualModal();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Try again.');
    }
  }

  function requestDeleteItem() {
    if (!editItem) return;
    setConfirmAction({ kind: 'delete-item', item: editItem });
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      if (confirmAction.kind === 'delete-item') {
        await deletePantryItemEntry(confirmAction.item.id);
        closeManualModal();
      } else if (confirmAction.kind === 'clear-location') {
        await clearPantryLocation(confirmAction.location);
      } else if (confirmAction.kind === 'resort') {
        await resortPantryItemsInDefaultLocation();
      } else {
        await clearAllPantry();
      }
      setConfirmAction(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Something went wrong.');
      setConfirmAction(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  const confirmCopy = useMemo(() => {
    if (!confirmAction) return null;
    if (confirmAction.kind === 'delete-item') {
      return {
        title: 'Delete item?',
        message: `Remove “${confirmAction.item.name}” from your pantry? This cannot be undone.`,
        confirmLabel: 'Delete item',
        destructive: true,
      };
    }
    if (confirmAction.kind === 'clear-location') {
      const label = labelForPantryStorageLocation(confirmAction.location);
      return {
        title: `Clear ${label}?`,
        message: `Remove all ${confirmAction.count} item(s) in ${label}? This cannot be undone.`,
        confirmLabel: `Clear ${label}`,
        destructive: true,
      };
    }
    if (confirmAction.kind === 'resort') {
      const parts: string[] = [];
      if (confirmAction.toFridge > 0) {
        parts.push(`${confirmAction.toFridge} to ${labelForPantryStorageLocation('fridge')}`);
      }
      if (confirmAction.toSpiceRack > 0) {
        parts.push(`${confirmAction.toSpiceRack} to ${labelForPantryStorageLocation('spice_rack')}`);
      }
      return {
        title: 'Re-sort items?',
        message: `Move ${parts.join(' and ')} from the default Pantry section. Items already in Fridge or Spice rack stay put.`,
        confirmLabel: 'Re-sort',
        destructive: false,
      };
    }
    return {
      title: 'Clear entire pantry?',
      message: `Remove all ${confirmAction.count} item(s) from every storage location? This cannot be undone.`,
      confirmLabel: 'Clear everything',
      destructive: true,
    };
  }, [confirmAction]);

  const reviewEnabledCount = useMemo(() => reviewItems.filter((i) => i.enabled).length, [reviewItems]);

  const showSetupHint = !visionReady && !demoMode;
  const scanControlsVisible = phase !== 'review';
  const shelvesMode = viewMode === 'shelves';
  /** With items on the shelves the scan cards fold behind the camera button, so the shelves start higher. */
  const scanCardsFolded = shelvesMode && pantry.length > 0;
  const scanCardsShown = scanControlsVisible && (!scanCardsFolded || scanPanelOpen || tutorial.active);
  const showStaplesInvite = pantry.length === 0 && !staplesInviteDismissed && phase !== 'review';
  /** "Plus" badge on the scan card: only for people the existing gate would not let scan (guest or free plan). */
  const scanAccessState = photoScanAccessState(photoScanAccess);
  const showScanPlusBadge = scanAccessState === 'guest_blocked' || scanAccessState === 'plan_blocked';
  /** Free account with free scans left: the shelf card says so instead of "Plus". */
  const freeScanBadge =
    !isPlusForScans && freeScans.remaining > 0 ? PLANS_COPY.freeScansLeftBadge(freeScans.remaining) : undefined;
  const receiptAccessState = photoScanAccessState(photoScanAccess);
  const showReceiptPlusBadge = receiptAccessState === 'guest_blocked' || receiptAccessState === 'plan_blocked';

  return (
    <>
      <View className="flex-1 bg-paper">
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingTop: 20, paddingBottom: phase === 'review' ? 96 : 32 }}
        >
        <View className="gap-4">
          <View>
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-[28px] font-extrabold leading-8 text-ink" accessibilityRole="header">
                  Pantry
                </Text>
                <Text className="mt-0.5 text-[13px] leading-[18px] text-muted">
                  {pantry.length > 0
                    ? SHELF_VIEW_COPY.summary(shelfSummary.total, shelfSummary.soon)
                    : 'Track what you own — fewer duplicate buys'}
                </Text>
              </View>
              <View
                className="flex-row rounded-full bg-border/60 p-[3px]"
                accessibilityRole="tablist"
                accessibilityLabel={SHELF_VIEW_COPY.viewToggleA11y}
              >
                {(['shelves', 'list'] as const).map((mode) => {
                  const active = viewMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => selectViewMode(mode)}
                      className={`h-[38px] items-center justify-center rounded-full px-3.5 ${active ? 'bg-primary' : ''}`}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                    >
                      <Text className={`text-[13px] ${active ? 'font-bold text-cream' : 'font-semibold text-ink'}`}>
                        {SHELF_VIEW_COPY[mode]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View className="mt-3 flex-row items-center gap-2">
              <Pressable
                onPress={openAddModal}
                className="h-11 flex-row items-center gap-1.5 rounded-full bg-primary pl-3 pr-4"
                accessibilityRole="button"
                accessibilityLabel="Add item"
              >
                <Ionicons name="add" size={20} color={THEME.brandCream} />
                <Text className="text-[15px] font-bold text-cream">Add item</Text>
              </Pressable>
              {scanCardsFolded && scanControlsVisible && featureFlags.photoScan ? (
                <Pressable
                  onPress={() => void handleQuickScan(false)}
                  className="h-11 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-tomato bg-card px-3"
                  accessibilityRole="button"
                  accessibilityLabel={SHELF_VIEW_COPY.scanA11y}
                >
                  <Ionicons name="camera-outline" size={20} color={THEME.tomatoDark} />
                  <Text className="text-[15px] font-extrabold text-ink" numberOfLines={1}>
                    {SHELF_VIEW_COPY.scanLabel}
                  </Text>
                  {showScanPlusBadge || freeScanBadge ? (
                    <View className="shrink-0 rounded-[10px] bg-tomato px-2 py-0.5">
                      <Text className="text-xs font-extrabold text-on-tomato">
                        {freeScanBadge ?? PANTRY_SCAN_UI_COPY.scanCardPlusBadge}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ) : null}
              {pantry.length > 0 ? (
                <Pressable
                  onPress={() => setOverflowOpen(true)}
                  className="ml-auto h-11 w-11 items-center justify-center rounded-full border border-border bg-card"
                  accessibilityRole="button"
                  accessibilityLabel={PANTRY_LIST_COPY.overflowMenuA11y}
                >
                  <Ionicons name="ellipsis-horizontal" size={22} color={THEME.ink} />
                </Pressable>
              ) : null}
            </View>
            <PantryAddStaplesLink onPress={openPantryStaples} />
          </View>

          {showStaplesInvite ? (
            <PantryStaplesInviteCard onPick={openPantryStaples} onDismiss={dismissStaplesInvite} />
          ) : null}

          {scanRecipeCount != null && scanRecipeCount > 0 ? (
            <View className="rounded-[18px] border border-primary bg-primary-light px-4 py-4">
              <Text className="text-base font-extrabold text-primary-dark">Pantry updated</Text>
              <Text className="mt-1 text-sm text-primary-dark">
                See {scanRecipeCount} recipe{scanRecipeCount === 1 ? '' : 's'} you can make with default matches.
              </Text>
              <Pressable
                onPress={() => {
                  setScanRecipeCount(null);
                  router.push(APP_ROUTES.home);
                }}
                className="mt-3 min-h-[44px] items-center justify-center rounded-full bg-primary px-4"
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-cream">See {scanRecipeCount} recipes</Text>
              </Pressable>
            </View>
          ) : null}

          {scanCardsShown ? (
            <View className="gap-2">
              <PantryStorageScanButtons
                disabled={!featureFlags.photoScan}
                guestPhotoScanBlocked={shouldBlockGuestPantryPhotoScan(photoScanGate)}
                authPhotoScanPending={
                  shouldDeferPantryPhotoScanForAuth(photoScanGate) ||
                  shouldDeferPhotoScanForProfile(photoScanAccess)
                }
                photoScanGate={photoScanGate}
                photoScanAccess={photoScanAccess}
                contextSession={session}
                scanLocation={scanLocationHint}
                onPrepareError={handleWebPrepareError}
                onImagePrepared={(location, prepared) => {
                  setScanLocationHint(location);
                  void runVisionFromPrepared(prepared, location);
                }}
                onRequestNativeScan={(_location, source) => void handleNativeScan(source)}
                onRequestSignIn={openAuthSheet}
                autoOpenScanMode={autoOpenScanMode}
                onAutoOpenScanHandled={() => setAutoOpenScanMode(null)}
                showPlusBadge={showScanPlusBadge}
                badgeText={freeScanBadge}
              />

              <PantryStorageScanButtons
                variant="receipt"
                disabled={!featureFlags.photoScan}
                guestPhotoScanBlocked={shouldBlockGuestPantryPhotoScan(photoScanGate)}
                authPhotoScanPending={
                  shouldDeferPantryPhotoScanForAuth(photoScanGate) ||
                  shouldDeferPhotoScanForProfile(photoScanAccess)
                }
                photoScanGate={photoScanGate}
                photoScanAccess={photoScanAccess}
                contextSession={session}
                scanLocation={scanLocationHint}
                onPrepareError={handleWebPrepareError}
                onImagePrepared={(location, prepared) => {
                  void runVisionFromPrepared(prepared, location, { kind: 'receipt' });
                }}
                onRequestNativeScan={(_location, source) => void handleNativeScan(source, 'receipt')}
                onRequestSignIn={openAuthSheet}
                showPlusBadge={showReceiptPlusBadge}
                badgeText={freeScanBadge}
              />

              {featureFlags.photoScan ? <PantryScanTip /> : null}
            </View>
          ) : null}

          {activeScans > 0 && phase !== 'review' ? (
            <View
              className="flex-row items-center gap-3 rounded-[18px] border border-border bg-card px-4 py-3.5"
              accessibilityRole="progressbar"
              accessibilityLabel={PANTRY_SCAN_UI_COPY.scanningPhotos(activeScans)}
            >
              <ActivityIndicator color={THEME.primary} />
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-ink">{PANTRY_SCAN_UI_COPY.scanningPhotos(activeScans)}</Text>
                <Text className="mt-0.5 text-xs leading-4 text-muted">{PANTRY_SCAN_UI_COPY.scanningKeepGoing}</Text>
              </View>
            </View>
          ) : null}

          {previewUri ? (
            <Image source={{ uri: previewUri }} className="h-32 w-full rounded-[18px]" resizeMode="cover" />
          ) : null}

          {showSetupHint ? (
            <View className="rounded-[18px] border border-border bg-card px-4 py-3">
              <Text className="text-sm font-bold text-ink">Photo scan not set up yet</Text>
              <Text className="mt-1 text-xs text-muted">{PHOTO_SCAN.notConfiguredMessage}</Text>
            </View>
          ) : null}

          {demoMode ? (
            <Text className="text-xs text-muted">
              Demo mode: scan returns labeled sample detections only (no cloud scan).
            </Text>
          ) : null}

          {scanQualityWarning ? (
            <View className="rounded-[18px] border border-border bg-card px-4 py-3">
              <Text className="text-xs text-muted">{scanQualityWarning}</Text>
            </View>
          ) : null}

          {scanNotice ? (
            <View className="rounded-[18px] border border-border bg-card px-4 py-3">
              <Text className="text-sm font-bold text-ink">{scanNotice.title}</Text>
              <Text className="mt-1 text-xs text-muted">{scanNotice.message}</Text>
              {lastScanAttempt ? (
                <Pressable
                  onPress={retryLastScan}
                  className="mt-3 min-h-[44px] items-center justify-center rounded-full border border-border bg-card px-4"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-bold text-primary-dark">{PHOTO_SCAN.tryAgainLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {scanError ? (
            <View className="rounded-[18px] border border-danger/25 bg-card px-4 py-3">
              <Text className="text-sm font-bold text-ink">{scanErrorTitle ?? PHOTO_SCAN.scanFailedTitle}</Text>
              <Text className="mt-1 text-xs text-muted">{scanError}</Text>
              {scanGuestSignInCta ? (
                <Pressable
                  onPress={openAuthSheet}
                  className="mt-3 min-h-[44px] items-center justify-center rounded-full bg-primary px-4"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-bold text-cream">{GUEST_MODE_COPY.pantryScanSignInCta}</Text>
                </Pressable>
              ) : null}
              {lastScanAttempt ? (
                <Pressable
                  onPress={retryLastScan}
                  className="mt-3 min-h-[44px] items-center justify-center rounded-full border border-border bg-card px-4"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-bold text-primary-dark">{PHOTO_SCAN.tryAgainLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {phase === 'review' && activeScans > 0 ? (
            <View className="flex-row items-center gap-3 rounded-[18px] border border-border bg-card px-4 py-3">
              <ActivityIndicator color={THEME.primary} />
              <Text className="min-w-0 flex-1 text-xs leading-4 text-muted">
                {PANTRY_SCAN_UI_COPY.moreStillScanning(activeScans)}
              </Text>
            </View>
          ) : null}

          {phase === 'review' && scanSummary && (scanSummary.receipt || scanSummary.already > 0) ? (
            <View className="rounded-[18px] border border-border bg-card px-4 py-3">
              <Text className="text-sm font-semibold text-ink">
                {scanSummary.receipt
                  ? PANTRY_SCAN_UI_COPY.receiptSummary(scanSummary.found, scanSummary.already)
                  : PANTRY_SCAN_UI_COPY.scanSummary(scanSummary.found, scanSummary.already)}
              </Text>
            </View>
          ) : null}

          {phase === 'review' ? (
            <Card>
              <PantryScanReview
                key={`${scanLocationHint}-${reviewItems.map((i) => i.key).join(',')}`}
                items={reviewItems}
                onChange={setReviewItems}
                onSave={() => void handleSaveReview()}
                onCancel={handleCancelReview}
                onAddAnotherPhoto={() => void handleAddAnotherPhotoFromReview()}
                addPhotoBusy={false}
                saving={saving}
                modelLabel={isAdmin ? modelLabel : undefined}
                saveError={saveError}
                defaultBatchLocation={scanLocationHint}
                onBatchLocationChange={setScanLocationHint}
                stickyFooter
                pantry={pantry}
                recipes={recipes}
                scanLocationHint={scanLocationHint}
                shareTrainingPhoto={userPreferences.shareScanPhotoForTraining}
                onShareTrainingPhotoChange={(value) => setUserPreference('shareScanPhotoForTraining', value)}
              />
            </Card>
          ) : null}

          {shelvesMode ? (
            <View className="flex-row flex-wrap gap-2" accessibilityRole="tablist">
              {SHELF_PLACES.map((place) => {
                const active = shelfPlace === place;
                return (
                  <Pressable
                    key={place}
                    onPress={() => selectLocationFilter(place)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    className={`min-h-[44px] items-center justify-center rounded-full border-[1.5px] px-3.5 ${
                      active ? 'border-primary bg-primary' : 'border-border bg-card'
                    }`}
                  >
                    <Text className={`text-sm font-bold ${active ? 'text-cream' : 'text-ink'}`}>
                      {SHELF_VIEW_COPY.placeLabels[place]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View className="gap-2">
              <PantryStorageLocationFilterChips
                selected={locationFilter}
                onSelect={selectLocationFilter}
                counts={locationFilterCounts}
              />

              <CategoryChips selected={filter} onSelect={setFilter} />
            </View>
          )}

          {actionError ? <Text className="text-xs font-semibold text-danger">{actionError}</Text> : null}

          {!profileReady && pantry.length === 0 ? (
            <View className="items-center justify-center py-8">
              <ActivityIndicator color={THEME.primary} />
            </View>
          ) : pantry.length === 0 ? (
            <TabEmptyState tab="pantry" className="mt-0" />
          ) : shelvesMode ? (
            <PantryShelves
              shelves={shelves}
              emptyMessage={SHELF_VIEW_COPY.emptyPlace(SHELF_VIEW_COPY.placeLabels[shelfPlace])}
              onPressItem={openEditModal}
              onSeeAll={openShelfInList}
            />
          ) : (
            <PantryFilteredItemList
              items={pantry}
              categoryFilter={filter}
              locationFilter={locationFilter}
              highlightItemIds={highlightItemIds}
              onPressItem={openEditModal}
              onResetFilters={() => {
                selectLocationFilter('all');
                setFilter('all');
              }}
            />
          )}
        </View>
        </ScrollView>

        {phase === 'review' ? (
          <PantryScanReviewStickyFooter
            saving={saving}
            enabledCount={reviewEnabledCount}
            onSave={() => void handleSaveReview()}
            onCancel={handleCancelReview}
          />
        ) : null}
      </View>

      <PantryOverflowMenu
        visible={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        resortPreviewTotal={resortPreview.total}
        onResort={() =>
          setConfirmAction({
            kind: 'resort',
            toFridge: resortPreview.toFridge,
            toSpiceRack: resortPreview.toSpiceRack,
          })
        }
        locationCounts={locationCounts}
        onClearLocation={(location, count) => setConfirmAction({ kind: 'clear-location', location, count })}
        totalCount={pantry.length}
        onClearAll={() => setConfirmAction({ kind: 'clear-all', count: pantry.length })}
        onScanReceipt={
          scanCardsFolded && scanControlsVisible && featureFlags.photoScan
            ? () => void handleQuickScan(true)
            : undefined
        }
        scanReceiptLabel={SHELF_VIEW_COPY.scanReceipt}
      />

      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={closeManualModal}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-3xl border border-border bg-paper px-4 pb-8 pt-4">
            <Text className="text-[19px] font-extrabold text-ink">{editItem ? 'Edit item' : 'Add item'}</Text>
            <TextInput
              value={manualName}
              onChangeText={handleManualNameChange}
              placeholder="Item name"
              accessibilityLabel="Item name"
              placeholderTextColor={THEME.muted}
              className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-base text-ink"
            />
            <View className="mt-3 flex-row gap-2">
              <TextInput
                value={manualQty}
                onChangeText={setManualQty}
                keyboardType="decimal-pad"
                placeholder="Qty"
                accessibilityLabel="Quantity"
                placeholderTextColor={THEME.muted}
                className="w-24 rounded-xl border border-border bg-card px-4 py-3 text-base text-ink"
              />
              <TextInput
                value={manualUnit}
                onChangeText={setManualUnit}
                placeholder="Unit"
                accessibilityLabel="Unit"
                placeholderTextColor={THEME.muted}
                className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-base text-ink"
              />
            </View>
            <Text className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
              {PANTRY_CATEGORIES.map((cat) => {
                const selected = manualCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      setManualCategory(cat);
                      setManualCategoryPicked(true);
                      if (!editItem && !manualLocationPicked) {
                        setManualLocation(suggestStorageLocationForCategory(cat));
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`mr-2 min-h-[44px] items-center justify-center rounded-full px-4 ${selected ? 'bg-primary' : 'border border-border bg-card'}`}
                  >
                    <Text className={`text-sm font-semibold ${selected ? 'text-cream' : 'text-ink'}`}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View className="mt-4">
              <PantryStorageLocationChips
                selected={manualLocation}
                onSelect={(location) => {
                  setManualLocation(location);
                  setManualLocationPicked(true);
                }}
              />
            </View>
            <Text className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">Expiration</Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {STAPLE_EXPIRY_QUICK_CHIPS.map((chip) => {
                const target = addDaysToIsoDate(todayIsoDate(), chip.days);
                const selected = manualExpiresOn === target;
                return (
                  <Pressable
                    key={chip.id}
                    onPress={() => {
                      setManualExpiresOn(target);
                      setManualExpiryInputOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`min-h-[44px] items-center justify-center rounded-full px-4 ${selected ? 'bg-primary' : 'border border-border bg-card'}`}
                  >
                    <Text className={`text-sm font-semibold ${selected ? 'text-cream' : 'text-ink'}`}>
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setManualExpiryInputOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ selected: manualExpiryInputOpen }}
                className={`min-h-[44px] items-center justify-center rounded-full px-4 ${manualExpiryInputOpen ? 'bg-primary' : 'border border-border bg-card'}`}
              >
                <Text
                  className={`text-sm font-semibold ${manualExpiryInputOpen ? 'text-cream' : 'text-ink'}`}
                >
                  {PANTRY_STAPLES_COPY.pickDate}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setManualExpiresOn(null);
                  setManualExpiryInputOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: manualExpiresOn === null }}
                className={`min-h-[44px] items-center justify-center rounded-full px-4 ${manualExpiresOn === null ? 'bg-primary' : 'border border-border bg-card'}`}
              >
                <Text
                  className={`text-sm font-semibold ${manualExpiresOn === null ? 'text-cream' : 'text-ink'}`}
                >
                  No date
                </Text>
              </Pressable>
            </View>
            {manualExpiryInputOpen ? (
              <TextInput
                value={manualExpiresOn ?? ''}
                onChangeText={(text) => setManualExpiresOn(text.trim() || null)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={THEME.muted}
                autoCapitalize="none"
                className="mt-2 rounded-xl border border-border bg-card px-4 py-3 text-base text-ink"
              />
            ) : null}
            {editItem?.scanPhotoPath ? (
              <ViewScanPhotoButton scanPhotoPath={editItem.scanPhotoPath} />
            ) : null}
            {formError ? <Text className="mt-2 text-xs font-semibold text-danger">{formError}</Text> : null}
            {editItem ? (
              <>
                <Pressable
                  onPress={() => cookWithPantryItem(editItem)}
                  className="mt-4 min-h-[44px] items-center justify-center rounded-full border border-primary/30 bg-primary-light px-4"
                  accessibilityRole="button"
                  accessibilityLabel={MAIN_INGREDIENT_COPY.cookWithThisAction}
                >
                  <Text className="text-center font-bold text-primary-dark">
                    {MAIN_INGREDIENT_COPY.cookWithThisAction}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={requestDeleteItem}
                  accessibilityRole="button"
                  className="mt-3 min-h-[44px] items-center justify-center rounded-full border border-danger/30 px-4"
                >
                  <Text className="text-center font-bold text-danger">Delete item</Text>
                </Pressable>
              </>
            ) : null}
            <View className="mt-6 flex-row gap-2">
              <Pressable
                onPress={closeManualModal}
                accessibilityRole="button"
                className="min-h-[44px] flex-1 items-center justify-center rounded-full border border-border bg-card px-4"
              >
                <Text className="text-center font-bold text-ink">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void submitManualForm()}
                accessibilityRole="button"
                className="min-h-[44px] flex-1 items-center justify-center rounded-full bg-primary px-4"
              >
                <Text className="text-center font-bold text-cream">{editItem ? 'Save changes' : 'Add to pantry'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={confirmAction !== null && confirmCopy !== null}
        title={confirmCopy?.title ?? ''}
        message={confirmCopy?.message ?? ''}
        confirmLabel={confirmCopy?.confirmLabel}
        destructive={confirmCopy?.destructive}
        loading={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) setConfirmAction(null);
        }}
        onConfirm={() => void runConfirmAction()}
      />
    </>
  );
}
