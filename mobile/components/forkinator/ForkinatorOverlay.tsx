import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import {
  parseStoredRecipesTabFilterState,
  RECIPES_TAB_FILTERS_STORAGE_KEY,
} from '../../config/recipesTabFilters';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotionEnabled } from '../../hooks/useReduceMotionEnabled';
import {
  FORKINATOR_ACCESSIBILITY_HINT,
  FORKINATOR_ACCESSIBILITY_LABEL,
} from '../../lib/forkinator/a11y';
import {
  FORKINATOR_GREETING_AUTO_HIDE_MS,
  FORKINATOR_GREETING_AUTO_SHOW_DELAY_MS,
  markForkinatorGreetingShown,
  readForkinatorGreetingShown,
} from '../../lib/forkinator/greetingShown';
import {
  openPantryCameraScanFromForkinator,
  openPantryScannerFromForkinator,
  openPantryWithWebShelfScanFile,
} from '../../lib/forkinator/openPantryScanner';
import { canSyncForkinatorWebCameraScan } from '../../lib/forkinator/forkinatorWebCameraScan';
import { pickWebImageFile } from '../../lib/web/pickWebImageFile';
import { useApp } from '../../context/AppContext';
import { useTutorialState } from '../../hooks/useTutorial';
import { THEME } from '../../config/appConfig';
import { readForkinatorHasScanned } from '../../lib/forkinator/hasScanned';
import {
  markForkinatorAisleSortPromptShown,
  markForkinatorAisleSortUsed,
  readForkinatorAisleSortUsed,
  shouldAutoShowForkinatorAisleSortPrompt,
} from '../../lib/forkinator/aisleSortPrompt';
import {
  FORKINATOR_AISLE_SORT_A11Y_LABEL,
  FORKINATOR_AISLE_SORT_BUTTON_A11Y_LABEL,
  FORKINATOR_AISLE_SORT_BUTTON_LABEL,
  FORKINATOR_AISLE_SORT_MESSAGE,
} from '../../lib/forkinator/aisleSortPromptCopy';
import {
  markForkinatorExpirationPromptShown,
  shouldAutoShowForkinatorExpirationPrompt,
} from '../../lib/forkinator/expirationPrompt';
import {
  buildForkinatorExpirationPromptMessage,
  FORKINATOR_EXPIRATION_PROMPT_A11Y_LABEL,
  FORKINATOR_EXPIRATION_SHOW_BUTTON_A11Y_LABEL,
  FORKINATOR_EXPIRATION_SHOW_BUTTON_LABEL,
} from '../../lib/forkinator/expirationPromptCopy';
import { openPantryExpiringHighlightFromForkinator } from '../../lib/forkinator/openPantryExpiringHighlight';
import {
  FORKINATOR_GREETING_A11Y_LABEL,
  FORKINATOR_GREETING_MESSAGE,
  FORKINATOR_SCANNER_CAMERA_BUTTON_A11Y_LABEL,
  FORKINATOR_SCANNER_CAMERA_BUTTON_LABEL,
  FORKINATOR_SCANNER_NUDGE_A11Y_LABEL,
  FORKINATOR_SCANNER_NUDGE_MESSAGE,
} from '../../lib/forkinator/scannerNudgeCopy';
import {
  hasMealPlanGroceryGrouping,
  readGroceryCombinePreference,
  writeGroceryCombinePreference,
} from '../../lib/grocery/grouping';
import { requestGroceryAisleCombineView } from '../../lib/grocery/groceryCombineRequest';
import { APP_ROUTES } from '../../config/appRoutes';
import type { PantryItem } from '../../types/mealprep';
import {
  appColumnSideInset,
  FORKINATOR_CLOUD_AUTO_COLLAPSE_MS,
  FORKINATOR_PINNED_HEIGHT_PX,
  FORKINATOR_PINNED_HIT_HEIGHT_PX,
  FORKINATOR_PINNED_HIT_PAD_LEFT_PX,
  FORKINATOR_PINNED_HIT_WIDTH_PX,
  FORKINATOR_PINNED_WIDTH_PX,
  forkinatorThinkDots,
  isForkinatorTabRoute,
  pinnedForkinatorPosition,
  resolvePinnedForkinatorTap,
} from '../../lib/forkinator/pinnedDock';
import { layoutScannerPrompt } from '../../lib/forkinator/scannerPromptLayout';
import {
  FORKINATOR_SCANNER_PROMPT_AUTO_SHOW_DELAY_MS,
  markForkinatorScannerNudgeShown,
  resolveForkinatorMascotTapAction,
  shouldAutoShowForkinatorScannerPrompt,
} from '../../lib/forkinator/scannerNudgeCooldown';
import { forkinatorMascotImageWebStyle } from '../../lib/forkinator/webTouchStyle';
import {
  resolveForkinatorMascotPose,
  type ForkinatorMascotPose,
} from '../../lib/forkinator/forkinatorPose';
import { ForkinatorScannerPrompt } from './ForkinatorScannerPrompt';
import { ForkInRoadQuizSheet } from './ForkInRoadQuizSheet';
import { AskForkySheet } from './AskForkySheet';
import {
  buildRestockReminderMessage,
  planStapleRestockLinesForCook,
  stapleDisplayNameForMessage,
} from '../../lib/forkinator/restockReminders';
import {
  consumeForkinatorRestockAfterCook,
  subscribeForkinatorRestockAfterCook,
} from '../../lib/forkinator/restockAfterCookEvent';
import { subscribeForkinatorTipsReset } from '../../lib/forkinator/resetForkinatorTipsEvent';
import {
  FORKINATOR_RESTOCK_PROMPT_A11Y_LABEL,
  FORKINATOR_RESTOCK_UNDO_BUTTON_A11Y_LABEL,
  FORKINATOR_RESTOCK_UNDO_BUTTON_LABEL,
} from '../../lib/forkinator/restockPromptCopy';
import {
  markForkInRoadPromptEngaged,
} from '../../lib/forkinator/forkInRoadPrompt';
import {
  FORKINATOR_FORK_IN_ROAD_A11Y_LABEL,
  FORKINATOR_FORK_IN_ROAD_BUTTON_A11Y_LABEL,
  FORKINATOR_FORK_IN_ROAD_BUTTON_LABEL,
  FORKINATOR_FORK_IN_ROAD_MESSAGE,
} from '../../lib/forkinator/forkInRoadPromptCopy';
import { buildForkInRoadCandidateRows } from '../../lib/forkinator/forkInRoadQuiz';
import { subscribeForkInRoadQuizRequest } from '../../lib/forkinator/forkInRoadQuizRequest';
import { filterRecipesTabRowsForDietPrefs } from '../../lib/diet/filterRows';
import { kitchenRecipesForPantryMatch } from '../../lib/recipeMatch/kitchenCatalogMerge';
import { readGuestPantry } from '../../lib/guest/localKitchenStore';
import { readJson } from '../../lib/storage';
import { logUsageEvent } from '../../lib/usage/usageLog';
import {
  forkyTipAllowed,
  readForkyTipFrequency,
  recordForkyTipOutcome,
  recordForkyTipShown,
} from '../../lib/forkinator/tipBackoff';
import {
  FORKINATOR_AUTO_PROMPT_PRIORITY,
  shouldReplaceForkinatorAutoPrompt,
  type ForkinatorAutoPromptKind,
} from '../../lib/forkinator/forkinatorActivePrompt';
import type { RecipesTabRow } from '../../config/recipesTabFilters';

const FORKINATOR_MASCOT_POSE_SOURCES: Record<ForkinatorMascotPose, number> = {
  full: require('../../assets/forkinator/forkinator-full.png'),
  idea: require('../../assets/forkinator/forkinator-idea.png'),
  thinking: require('../../assets/forkinator/forkinator-thinking.png'),
  sad: require('../../assets/forkinator/forkinator-sad.png'),
};

const IS_WEB = Platform.OS === 'web';

export function ForkinatorOverlay() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotionEnabled();
  const pathname = usePathname();
  const {
    demoMode,
    isGuest,
    authReady,
    session,
    profile,
    profileReady,
    featureFlags,
    grocery,
    mealPlan,
    pantry,
    addManualGroceryItem,
    removeGroceryItem,
    feedKitchenRecipes,
    recipes,
    pantryRecipeMatches,
    userDietPrefs,
    kitchenPantryReady,
    mealMadeReview,
  } = useApp();
  const pantryForForkinator = useMemo(() => {
    if (!isGuest || pantry.length > 0) return pantry;
    if (!kitchenPantryReady) return pantry;
    return readGuestPantry();
  }, [isGuest, kitchenPantryReady, pantry]);

  const photoScanAccess = useMemo(
    () => ({
      demoMode,
      authReady,
      hasSession: Boolean(session),
      plan: profile.plan,
      role: profile.role,
      profileReady,
    }),
    [authReady, demoMode, profile.plan, profile.role, profileReady, session],
  );
  const [greetingPromptVisible, setGreetingPromptVisible] = useState(false);
  const [scannerPromptVisible, setScannerPromptVisible] = useState(false);
  const [expirationPromptVisible, setExpirationPromptVisible] = useState(false);
  const [aisleSortPromptVisible, setAisleSortPromptVisible] = useState(false);
  const [restockPromptVisible, setRestockPromptVisible] = useState(false);
  const [restockPromptMessage, setRestockPromptMessage] = useState('');
  const [restockUndoLines, setRestockUndoLines] = useState<
    { id: string | null; name: string; unit: string }[]
  >([]);
  const [forkInRoadExpanded, setForkInRoadExpanded] = useState(false);
  const [forkInRoadQuizVisible, setForkInRoadQuizVisible] = useState(false);
  const [mascotImageLoaded, setMascotImageLoaded] = useState(false);
  const [expirationPromptItems, setExpirationPromptItems] = useState<PantryItem[]>([]);
  const [tipsAutoShowEpoch, setTipsAutoShowEpoch] = useState(0);
  /** How often Forky speaks up by himself: the person's choice in Account (normal, less, off). */
  const [tipFrequency, setTipFrequency] = useState(readForkyTipFrequency);
  const greetingAutoShowStartedRef = useRef(false);
  const expirationAutoShowStartedRef = useRef(false);
  const scannerAutoShowStartedRef = useRef(false);
  const autoShowPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockScannerThisSessionRef = useRef(false);
  const greetingPromptVisibleRef = useRef(false);
  const scannerPromptVisibleRef = useRef(false);
  const expirationPromptVisibleRef = useRef(false);
  const aisleSortPromptVisibleRef = useRef(false);
  const restockPromptVisibleRef = useRef(false);
  const forkInRoadPromptVisibleRef = useRef(false);
  const sessionAutoPromptShownRef = useRef(false);
  /** Auto-prompt whose timer is scheduled but not fired yet (FK3-7). */
  const pendingAutoPromptKindRef = useRef<ForkinatorAutoPromptKind | null>(null);
  const restockHandledForCookRef = useRef(false);
  const aisleCheckedOnPathRef = useRef(false);

  const visibleAutoPromptKind = useCallback((): ForkinatorAutoPromptKind | null => {
    if (greetingPromptVisibleRef.current) return 'greeting';
    if (expirationPromptVisibleRef.current) return 'expiration';
    if (restockPromptVisibleRef.current) return 'restock';
    if (aisleSortPromptVisibleRef.current) return 'aisleSort';
    if (scannerPromptVisibleRef.current) return 'scanner';
    if (forkInRoadPromptVisibleRef.current) return 'forkInRoad';
    return null;
  }, []);

  /**
   * Show one auto prompt. A lower-priority prompt never replaces a visible higher one
   * (FK3-7); `force` is for prompts caused by the user's own action (restock after cooking).
   */
  const showAutoPrompt = useCallback((kind: ForkinatorAutoPromptKind, options?: { force?: boolean }) => {
    const current = visibleAutoPromptKind();
    if (
      !options?.force &&
      current &&
      current !== kind &&
      !shouldReplaceForkinatorAutoPrompt(current, kind)
    ) {
      return false;
    }
    const setters: Record<ForkinatorAutoPromptKind, (v: boolean) => void> = {
      greeting: setGreetingPromptVisible,
      expiration: setExpirationPromptVisible,
      restock: setRestockPromptVisible,
      aisleSort: setAisleSortPromptVisible,
      scanner: setScannerPromptVisible,
      // Fork in the road is derived (always on while on Home); it is never auto-scheduled.
      forkInRoad: () => {},
    };
    const setter = setters[kind];
    setGreetingPromptVisible(false);
    setExpirationPromptVisible(false);
    setRestockPromptVisible(false);
    setAisleSortPromptVisible(false);
    setScannerPromptVisible(false);
    setter(true);
    greetingPromptVisibleRef.current = kind === 'greeting';
    expirationPromptVisibleRef.current = kind === 'expiration';
    restockPromptVisibleRef.current = kind === 'restock';
    aisleSortPromptVisibleRef.current = kind === 'aisleSort';
    scannerPromptVisibleRef.current = kind === 'scanner';
    sessionAutoPromptShownRef.current = true;
    // Counts toward "less often", and notes whether the last one was left untouched.
    recordForkyTipShown(kind);
    return true;
  }, [visibleAutoPromptKind]);

  const isGroceryScreen =
    pathname === '/grocery' ||
    pathname.endsWith('/grocery') ||
    pathname.includes('/(tabs)/grocery');
  const isHomeScreen =
    pathname === '/' ||
    pathname === '/index' ||
    pathname.endsWith('/index') ||
    pathname === '/(tabs)' ||
    pathname.endsWith('/(tabs)');

  // Forky is pinned in the tab screens' top bar, where the round logo used to be. He does not
  // move or drag, and he stays off full-screen pages (they have a back button in that corner).
  const onTabRoute = isForkinatorTabRoute(pathname);
  const columnInset = appColumnSideInset(width);
  const position = useMemo(
    () => (onTabRoute && width > 0 && height > 0 ? pinnedForkinatorPosition(width, insets.left) : null),
    [height, insets.left, onTabRoute, width],
  );

  useEffect(() => {
    greetingPromptVisibleRef.current = greetingPromptVisible;
  }, [greetingPromptVisible]);

  useEffect(() => {
    scannerPromptVisibleRef.current = scannerPromptVisible;
  }, [scannerPromptVisible]);

  useEffect(() => {
    expirationPromptVisibleRef.current = expirationPromptVisible;
  }, [expirationPromptVisible]);

  useEffect(() => {
    aisleSortPromptVisibleRef.current = aisleSortPromptVisible;
  }, [aisleSortPromptVisible]);

  useEffect(() => {
    restockPromptVisibleRef.current = restockPromptVisible;
  }, [restockPromptVisible]);

  const openGroceryCount = useMemo(() => grocery.filter((item) => !item.checked).length, [grocery]);
  const groceryCombineByAisle = readGroceryCombinePreference();
  const showMealGrouping = hasMealPlanGroceryGrouping(mealPlan);
  const expirationExpirationMessage = useMemo(
    () => buildForkinatorExpirationPromptMessage(expirationPromptItems),
    [expirationPromptItems],
  );

  useEffect(() => {
    if (!greetingPromptVisible) return;
    const timer = setTimeout(() => setGreetingPromptVisible(false), FORKINATOR_GREETING_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [greetingPromptVisible]);

  useEffect(() => {
    return subscribeForkinatorTipsReset(() => {
      if (autoShowPromptTimerRef.current != null) {
        clearTimeout(autoShowPromptTimerRef.current);
        autoShowPromptTimerRef.current = null;
      }
      greetingAutoShowStartedRef.current = false;
      expirationAutoShowStartedRef.current = false;
      scannerAutoShowStartedRef.current = false;
      blockScannerThisSessionRef.current = false;
      sessionAutoPromptShownRef.current = false;
      pendingAutoPromptKindRef.current = null;
      aisleCheckedOnPathRef.current = false;
      setGreetingPromptVisible(false);
      setScannerPromptVisible(false);
      setExpirationPromptVisible(false);
      setAisleSortPromptVisible(false);
      setRestockPromptVisible(false);
      setForkInRoadExpanded(false);
      setForkInRoadQuizVisible(false);
      setMascotImageLoaded(false);
      setExpirationPromptItems([]);
      setRestockPromptMessage('');
      setRestockUndoLines([]);
      setTipFrequency(readForkyTipFrequency());
      setTipsAutoShowEpoch((epoch) => epoch + 1);
    });
  }, []);

  const mascotReady = position !== null && width > 0 && height > 0;
  const forkinatorUiReady = mascotReady && mascotImageLoaded;

  useEffect(() => {
    if (!mascotReady || !kitchenPantryReady) return;

    const delay = FORKINATOR_SCANNER_PROMPT_AUTO_SHOW_DELAY_MS;

    if (!readForkinatorGreetingShown()) {
      if (greetingAutoShowStartedRef.current) return;
      greetingAutoShowStartedRef.current = true;
      blockScannerThisSessionRef.current = true;
      pendingAutoPromptKindRef.current = 'greeting';
      autoShowPromptTimerRef.current = setTimeout(() => {
        autoShowPromptTimerRef.current = null;
        pendingAutoPromptKindRef.current = null;
        if (sessionAutoPromptShownRef.current) return;
        if (showAutoPrompt('greeting')) markForkinatorGreetingShown();
      }, FORKINATOR_GREETING_AUTO_SHOW_DELAY_MS);
      return;
    }

    const expirationPlan = shouldAutoShowForkinatorExpirationPrompt(pantryForForkinator);
    if (expirationPlan.show && forkyTipAllowed('expiration')) {
      if (expirationAutoShowStartedRef.current) return;
      expirationAutoShowStartedRef.current = true;
      pendingAutoPromptKindRef.current = 'expiration';
      autoShowPromptTimerRef.current = setTimeout(() => {
        autoShowPromptTimerRef.current = null;
        pendingAutoPromptKindRef.current = null;
        if (sessionAutoPromptShownRef.current) return;
        setExpirationPromptItems(expirationPlan.items);
        if (showAutoPrompt('expiration')) {
          markForkinatorExpirationPromptShown(expirationPlan.items.map((item) => item.id));
        }
      }, delay);
      return;
    }

    if (blockScannerThisSessionRef.current) return;
    if (scannerAutoShowStartedRef.current) return;
    if (!shouldAutoShowForkinatorScannerPrompt(readForkinatorHasScanned())) return;
    // Resting after being closed unused, or tips are set to less often or off.
    if (!forkyTipAllowed('scanner')) return;

    scannerAutoShowStartedRef.current = true;
    pendingAutoPromptKindRef.current = 'scanner';
    autoShowPromptTimerRef.current = setTimeout(() => {
      autoShowPromptTimerRef.current = null;
      pendingAutoPromptKindRef.current = null;
      if (blockScannerThisSessionRef.current) return;
      if (sessionAutoPromptShownRef.current) return;
      if (!shouldAutoShowForkinatorScannerPrompt(readForkinatorHasScanned())) return;
      if (showAutoPrompt('scanner')) markForkinatorScannerNudgeShown();
    }, delay);
  }, [kitchenPantryReady, mascotReady, pantryForForkinator, showAutoPrompt, tipsAutoShowEpoch]);

  useEffect(() => {
    if (!isGroceryScreen) {
      aisleCheckedOnPathRef.current = false;
      return;
    }
    if (!mascotReady || !kitchenPantryReady) return;
    if (sessionAutoPromptShownRef.current) return;
    if (aisleCheckedOnPathRef.current) return;
    const pendingKind = pendingAutoPromptKindRef.current;
    if (
      pendingKind &&
      FORKINATOR_AUTO_PROMPT_PRIORITY[pendingKind] > FORKINATOR_AUTO_PROMPT_PRIORITY.aisleSort
    ) {
      // Greeting/expiration is about to show; don't burn aisle's once-a-day slot (FK3-7).
      return;
    }
    const aisleEligible = shouldAutoShowForkinatorAisleSortPrompt({
      openGroceryItemCount: openGroceryCount,
      showMealGrouping,
      combineByAisle: groceryCombineByAisle,
    });
    if (!aisleEligible) {
      if (
        readForkinatorAisleSortUsed() ||
        groceryCombineByAisle ||
        (showMealGrouping && openGroceryCount >= 5)
      ) {
        aisleCheckedOnPathRef.current = true;
      }
      return;
    }
    aisleCheckedOnPathRef.current = true;
    if (!forkyTipAllowed('aisleSort')) return;
    if (showAutoPrompt('aisleSort')) markForkinatorAisleSortPromptShown();
  }, [
    groceryCombineByAisle,
    isGroceryScreen,
    kitchenPantryReady,
    mascotReady,
    openGroceryCount,
    showMealGrouping,
    showAutoPrompt,
  ]);

  // FK3-8: aisle and fork-in-the-road prompts belong to their own screens, and the Made-it
  // review sheet counts as busy (adjusted during render, not in an effect).
  const mealMadeReviewOpen = mealMadeReview != null;
  // Also dropped when the list has nothing left to sort: the offer used to stay up over an empty
  // list (seen live 2026-10-10) after the items were cleared or the saved list loaded empty.
  if ((aisleSortPromptVisible && !isGroceryScreen) || (aisleSortPromptVisible && openGroceryCount === 0)) {
    setAisleSortPromptVisible(false);
  }
  if (!isHomeScreen && forkInRoadExpanded) {
    setForkInRoadExpanded(false);
  }

  useEffect(() => {
    if (!greetingPromptVisible) return;
    setAisleSortPromptVisible(false);
    setScannerPromptVisible(false);
  }, [greetingPromptVisible]);

  useEffect(() => {
    return () => {
      if (autoShowPromptTimerRef.current != null) {
        clearTimeout(autoShowPromptTimerRef.current);
        autoShowPromptTimerRef.current = null;
      }
    };
  }, []);

  const processRestockAfterCook = useCallback(async () => {
    const payload = consumeForkinatorRestockAfterCook();
    if (!payload?.pantryDeductionApplied) return;
    if (restockHandledForCookRef.current) return;
    restockHandledForCookRef.current = true;

    const lines = planStapleRestockLinesForCook(
      payload.nextPantry,
      payload.deductedPantryRows ?? [],
      grocery,
    );
    if (lines.length === 0) return;

    const undoLines: { id: string | null; name: string; unit: string }[] = [];
    for (const line of lines) {
      const id = await addManualGroceryItem({
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        category: line.category,
      });
      undoLines.push({ id, name: line.name, unit: line.unit });
    }

    const messageNames = lines.map((line) => stapleDisplayNameForMessage(line.stapleId, line.name));
    setRestockUndoLines(undoLines);
    setRestockPromptMessage(buildRestockReminderMessage(messageNames));
    showAutoPrompt('restock', { force: true });
  }, [addManualGroceryItem, grocery, showAutoPrompt]);

  useEffect(() => {
    const unsubscribe = subscribeForkinatorRestockAfterCook(() => {
      restockHandledForCookRef.current = false;
      void processRestockAfterCook();
    });
    return unsubscribe;
  }, [processRestockAfterCook]);

  const forkInRoadCandidateRows = useMemo((): RecipesTabRow[] => {
    const filterState = parseStoredRecipesTabFilterState(
      readJson(RECIPES_TAB_FILTERS_STORAGE_KEY, null),
    );
    const kitchenSource =
      feedKitchenRecipes.length > 0
        ? feedKitchenRecipes
        : kitchenRecipesForPantryMatch(recipes);
    const rows = buildForkInRoadCandidateRows({
      kitchenRecipes: kitchenSource,
      pantryMatches: pantryRecipeMatches,
      filterState,
    });
    return filterRecipesTabRowsForDietPrefs(rows, userDietPrefs);
  }, [feedKitchenRecipes, pantryRecipeMatches, recipes, userDietPrefs]);

  /**
   * Fork in the road (meal suggestions) stays up the whole time the user is on Home/recipes:
   * no idle wait, daily limit, or dismissal cooldown. It yields to any other prompt, hides
   * while the Made-it review or the quiz is open, and leaving Home hides it.
   */
  const forkInRoadPromptVisible =
    forkinatorUiReady &&
    tipFrequency !== 'off' &&
    isHomeScreen &&
    !mealMadeReviewOpen &&
    !forkInRoadQuizVisible &&
    !greetingPromptVisible &&
    !expirationPromptVisible &&
    !restockPromptVisible &&
    !aisleSortPromptVisible &&
    !scannerPromptVisible &&
    forkInRoadCandidateRows.length > 0;

  useEffect(() => {
    forkInRoadPromptVisibleRef.current = forkInRoadPromptVisible;
  }, [forkInRoadPromptVisible]);

  const collapseForkInRoadPrompt = useCallback(() => {
    setForkInRoadExpanded(false);
  }, []);

  /**
   * Which message Forky has right now, if any (one at a time, same order as before).
   * Its cloud opens under him, folds away by itself after a few seconds, and leaves two small
   * think bubbles at his feet; tapping him opens it again.
   */
  const shownPrompt: ForkinatorAutoPromptKind | null = !forkinatorUiReady
    ? null
    : greetingPromptVisible
      ? 'greeting'
      : expirationPromptVisible && !restockPromptVisible
        ? 'expiration'
        : restockPromptVisible
          ? 'restock'
          : aisleSortPromptVisible
            ? 'aisleSort'
            : scannerPromptVisible
              ? 'scanner'
              : null;
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudPrompt, setCloudPrompt] = useState<ForkinatorAutoPromptKind | null>(null);
  if (cloudPrompt !== shownPrompt) {
    // A new message opens its cloud (adjusted during render, not in an effect).
    setCloudPrompt(shownPrompt);
    setCloudOpen(shownPrompt != null);
  }

  useEffect(() => {
    if (!shownPrompt || !cloudOpen) return;
    const timer = setTimeout(() => setCloudOpen(false), FORKINATOR_CLOUD_AUTO_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [cloudOpen, shownPrompt]);

  useEffect(() => {
    if (!forkInRoadExpanded) return;
    const timer = setTimeout(() => setForkInRoadExpanded(false), FORKINATOR_CLOUD_AUTO_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [forkInRoadExpanded]);

  // While the first-time tour is open Forky's own clouds and bubbles stay out of its way.
  const tutorialActive = useTutorialState().active;

  // Usage log: one "shown" per cloud that actually opened in front of the person.
  const loggedShownPromptRef = useRef<ForkinatorAutoPromptKind | null>(null);
  useEffect(() => {
    if (!shownPrompt) {
      loggedShownPromptRef.current = null;
      return;
    }
    if (!cloudOpen || tutorialActive || loggedShownPromptRef.current === shownPrompt) return;
    loggedShownPromptRef.current = shownPrompt;
    logUsageEvent('forky_prompt_shown', { prompt: shownPrompt });
  }, [cloudOpen, shownPrompt, tutorialActive]);
  useEffect(() => {
    if (forkInRoadPromptVisible && forkInRoadExpanded && !tutorialActive) {
      logUsageEvent('forky_prompt_shown', { prompt: 'forkInRoad' });
    }
  }, [forkInRoadExpanded, forkInRoadPromptVisible, tutorialActive]);

  /** Think bubbles: Forky has something to say and its cloud is folded away. */
  const thinkDotsVisible =
    forkinatorUiReady &&
    !tutorialActive &&
    ((shownPrompt != null && !cloudOpen) ||
      (shownPrompt == null && forkInRoadPromptVisible && !forkInRoadExpanded));

  const handleMascotImageLoad = useCallback(() => {
    setMascotImageLoaded(true);
  }, []);

  const greetingPromptLayout = useMemo(() => {
    if (!position) return null;
    return layoutScannerPrompt({
      mascotX: position.x,
      mascotY: position.y,
      mascotWidth: FORKINATOR_PINNED_WIDTH_PX,
      mascotHeight: FORKINATOR_PINNED_HEIGHT_PX,
      preferBelow: true,
      screenWidth: width,
      screenHeight: height,
      insetTop: insets.top,
      insetRight: insets.right + columnInset,
      insetBottom: insets.bottom,
      insetLeft: insets.left + columnInset,
      message: FORKINATOR_GREETING_MESSAGE,
    });
  }, [columnInset, height, insets.bottom, insets.left, insets.right, insets.top, position, width]);

  const expirationPromptLayout = useMemo(() => {
    if (!position || expirationPromptItems.length === 0) return null;
    return layoutScannerPrompt({
      mascotX: position.x,
      mascotY: position.y,
      mascotWidth: FORKINATOR_PINNED_WIDTH_PX,
      mascotHeight: FORKINATOR_PINNED_HEIGHT_PX,
      preferBelow: true,
      screenWidth: width,
      screenHeight: height,
      insetTop: insets.top,
      insetRight: insets.right + columnInset,
      insetBottom: insets.bottom,
      insetLeft: insets.left + columnInset,
      message: expirationExpirationMessage,
      includeActionButton: true,
    });
  }, [
    columnInset,
    expirationExpirationMessage,
    expirationPromptItems.length,
    height,
    insets.bottom,
    insets.left,
    insets.right,
    insets.top,
    position,
    width,
  ]);

  const aisleSortPromptLayout = useMemo(() => {
    if (!position) return null;
    return layoutScannerPrompt({
      mascotX: position.x,
      mascotY: position.y,
      mascotWidth: FORKINATOR_PINNED_WIDTH_PX,
      mascotHeight: FORKINATOR_PINNED_HEIGHT_PX,
      preferBelow: true,
      screenWidth: width,
      screenHeight: height,
      insetTop: insets.top,
      insetRight: insets.right + columnInset,
      insetBottom: insets.bottom,
      insetLeft: insets.left + columnInset,
      message: FORKINATOR_AISLE_SORT_MESSAGE,
      includeActionButton: true,
    });
  }, [columnInset, height, insets.bottom, insets.left, insets.right, insets.top, position, width]);

  const restockPromptLayout = useMemo(() => {
    if (!position || !restockPromptMessage) return null;
    return layoutScannerPrompt({
      mascotX: position.x,
      mascotY: position.y,
      mascotWidth: FORKINATOR_PINNED_WIDTH_PX,
      mascotHeight: FORKINATOR_PINNED_HEIGHT_PX,
      preferBelow: true,
      screenWidth: width,
      screenHeight: height,
      insetTop: insets.top,
      insetRight: insets.right + columnInset,
      insetBottom: insets.bottom,
      insetLeft: insets.left + columnInset,
      message: restockPromptMessage,
      includeActionButton: true,
    });
  }, [
    columnInset,
    height,
    insets.bottom,
    insets.left,
    insets.right,
    insets.top,
    position,
    restockPromptMessage,
    width,
  ]);

  const forkInRoadCloudLayout = useMemo(() => {
    if (!position) return null;
    return layoutScannerPrompt({
      mascotX: position.x,
      mascotY: position.y,
      mascotWidth: FORKINATOR_PINNED_WIDTH_PX,
      mascotHeight: FORKINATOR_PINNED_HEIGHT_PX,
      preferBelow: true,
      screenWidth: width,
      screenHeight: height,
      insetTop: insets.top,
      insetRight: insets.right + columnInset,
      insetBottom: insets.bottom,
      insetLeft: insets.left + columnInset,
      message: FORKINATOR_FORK_IN_ROAD_MESSAGE,
      includeActionButton: true,
    });
  }, [columnInset, height, insets.bottom, insets.left, insets.right, insets.top, position, width]);

  const scannerPromptLayout = useMemo(() => {
    if (!position) return null;
    return layoutScannerPrompt({
      mascotX: position.x,
      mascotY: position.y,
      mascotWidth: FORKINATOR_PINNED_WIDTH_PX,
      mascotHeight: FORKINATOR_PINNED_HEIGHT_PX,
      preferBelow: true,
      screenWidth: width,
      screenHeight: height,
      insetTop: insets.top,
      insetRight: insets.right + columnInset,
      insetBottom: insets.bottom,
      insetLeft: insets.left + columnInset,
      message: FORKINATOR_SCANNER_NUDGE_MESSAGE,
      includeCameraButton: true,
    });
  }, [columnInset, height, insets.bottom, insets.left, insets.right, insets.top, position, width]);

  const handleScannerCameraPress = useCallback(() => {
    logUsageEvent('forky_prompt_tapped', { prompt: 'scanner', action: 'camera' });
    recordForkyTipOutcome('scanner', 'tapped');
    setScannerPromptVisible(false);
    markForkinatorScannerNudgeShown();
    if (!IS_WEB) {
      openPantryCameraScanFromForkinator();
      return;
    }
    if (!featureFlags.photoScan || !canSyncForkinatorWebCameraScan(photoScanAccess)) {
      openPantryScannerFromForkinator();
      return;
    }
    void (async () => {
      const file = await pickWebImageFile({ capture: 'environment' });
      if (!file) return;
      openPantryWithWebShelfScanFile(file);
    })();
  }, [featureFlags.photoScan, photoScanAccess]);

  const handleAisleSortPress = useCallback(() => {
    logUsageEvent('forky_prompt_tapped', { prompt: 'aisleSort' });
    recordForkyTipOutcome('aisleSort', 'tapped');
    setAisleSortPromptVisible(false);
    markForkinatorAisleSortUsed();
    writeGroceryCombinePreference(true);
    requestGroceryAisleCombineView();
    if (!isGroceryScreen) {
      router.push(APP_ROUTES.grocery);
    }
  }, [isGroceryScreen]);

  const handleExpirationShowPress = useCallback(() => {
    const ids = expirationPromptItems.map((item) => item.id);
    logUsageEvent('forky_prompt_tapped', { prompt: 'expiration' });
    recordForkyTipOutcome('expiration', 'tapped');
    setExpirationPromptVisible(false);
    openPantryExpiringHighlightFromForkinator(ids);
  }, [expirationPromptItems]);

  const handleRestockUndoPress = useCallback(() => {
    logUsageEvent('forky_prompt_tapped', { prompt: 'restock', action: 'undo' });
    for (const target of restockUndoLines) {
      // FK3-6: remove exactly the row Forky added, by id (server id once saved). If a list
      // refresh dropped it from memory, removeGroceryItem still deletes it on the server.
      if (target.id) {
        removeGroceryItem(target.id);
        continue;
      }
      const normalized = target.name.trim().toLowerCase();
      const row = grocery.find(
        (item) =>
          !item.checked &&
          item.name.trim().toLowerCase() === normalized &&
          item.unit === target.unit,
      );
      if (row) removeGroceryItem(row.id);
    }
    setRestockUndoLines([]);
    setRestockPromptVisible(false);
  }, [grocery, removeGroceryItem, restockUndoLines]);

  const handleForkInRoadHelpPress = useCallback(() => {
    logUsageEvent('forky_prompt_tapped', { prompt: 'forkInRoad' });
    markForkInRoadPromptEngaged();
    setForkInRoadExpanded(false);
    setForkInRoadQuizVisible(true);
  }, []);

  // Any screen can ask for this same quiz (the Home card that did was removed 2026-10-10).
  useEffect(
    () => subscribeForkInRoadQuizRequest(handleForkInRoadHelpPress),
    [handleForkInRoadHelpPress],
  );

  const handleForkInRoadOpenRecipe = useCallback((row: RecipesTabRow) => {
    if (row.kind !== 'kitchen') return;
    router.push({ pathname: '/', params: { recipeId: row.recipe.id } });
  }, []);

  // Ask Forky (AI chat): tapping Forky in the top bar opens it. Off for customers until the
  // switch is on; admin accounts can try it first.
  const askForkyAvailable = (featureFlags.askForky || profile.role === 'admin') && !demoMode;
  const [askForkyOpen, setAskForkyOpen] = useState(false);
  const handleAskForkyOpenRecipe = useCallback((recipeId: string) => {
    router.push({ pathname: '/', params: { recipeId } });
  }, []);

  const handleMascotActivate = useCallback(() => {
    const pinnedTap = resolvePinnedForkinatorTap({
      promptShowing: shownPrompt != null,
      cloudOpen,
      forkInRoadPromptVisible,
      forkInRoadExpanded,
      askForkyAvailable,
    });
    if (pinnedTap === 'reopenCloud') {
      setCloudOpen(true);
      return;
    }
    if (pinnedTap === 'openForkInRoadCloud') {
      setForkInRoadExpanded(true);
      return;
    }
    const action = resolveForkinatorMascotTapAction({
      greetingPromptVisible: greetingPromptVisibleRef.current,
      expirationPromptVisible: expirationPromptVisibleRef.current,
      restockPromptVisible: restockPromptVisibleRef.current,
      forkInRoadPromptVisible: forkInRoadPromptVisibleRef.current,
      forkInRoadExpanded,
      aisleSortPromptVisible: aisleSortPromptVisibleRef.current,
      scannerPromptVisible: scannerPromptVisibleRef.current,
    });
    // A tap always means "I want to ask": open the chat, and still clear whatever bubble was up.
    if (askForkyAvailable) setAskForkyOpen(true);
    if (askForkyAvailable) logUsageEvent('ask_forky_opened');
    if (action === 'dismissGreetingPrompt') {
      logUsageEvent('forky_prompt_dismissed', { prompt: 'greeting' });
      setGreetingPromptVisible(false);
      return;
    }
    if (action === 'dismissExpirationPrompt') {
      logUsageEvent('forky_prompt_dismissed', { prompt: 'expiration' });
      recordForkyTipOutcome('expiration', 'dismissed');
      setExpirationPromptVisible(false);
      return;
    }
    if (action === 'dismissRestockPrompt') {
      logUsageEvent('forky_prompt_dismissed', { prompt: 'restock' });
      setRestockPromptVisible(false);
      return;
    }
    if (action === 'collapseForkInRoadPrompt') {
      logUsageEvent('forky_prompt_dismissed', { prompt: 'forkInRoad' });
      collapseForkInRoadPrompt();
      return;
    }
    if (action === 'dismissAisleSortPrompt') {
      logUsageEvent('forky_prompt_dismissed', { prompt: 'aisleSort' });
      recordForkyTipOutcome('aisleSort', 'dismissed');
      setAisleSortPromptVisible(false);
      return;
    }
    if (action === 'dismissScannerPrompt') {
      logUsageEvent('forky_prompt_dismissed', { prompt: 'scanner' });
      recordForkyTipOutcome('scanner', 'dismissed');
      setScannerPromptVisible(false);
      return;
    }
    // No active prompt: without Ask Forky, tapping Forky does nothing.
  }, [
    askForkyAvailable,
    cloudOpen,
    collapseForkInRoadPrompt,
    forkInRoadExpanded,
    forkInRoadPromptVisible,
    shownPrompt,
  ]);

  if (!position || width <= 0 || height <= 0) return null;

  const imageWebStyle = forkinatorMascotImageWebStyle();
  const mascotPose = resolveForkinatorMascotPose({
    expirationPromptVisible,
    restockPromptVisible,
    forkInRoadPromptVisible,
    aisleSortPromptVisible,
    scannerPromptVisible,
    greetingPromptVisible,
  });
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-0"
      style={{ zIndex: 100001 }}
    >
      {greetingPromptLayout ? (
        <ForkinatorScannerPrompt
          layout={greetingPromptLayout}
          visible={shownPrompt === 'greeting' && cloudOpen && !tutorialActive}
          reduceMotion={reduceMotion}
          message={FORKINATOR_GREETING_MESSAGE}
          accessibilityLabel={FORKINATOR_GREETING_A11Y_LABEL}
          onPress={() => {
            logUsageEvent('forky_prompt_dismissed', { prompt: 'greeting' });
            setGreetingPromptVisible(false);
          }}
        />
      ) : null}
      {restockPromptLayout ? (
        <ForkinatorScannerPrompt
          layout={restockPromptLayout}
          visible={shownPrompt === 'restock' && cloudOpen && !tutorialActive}
          reduceMotion={reduceMotion}
          message={restockPromptMessage}
          accessibilityLabel={FORKINATOR_RESTOCK_PROMPT_A11Y_LABEL}
          onPress={() => {
            logUsageEvent('forky_prompt_dismissed', { prompt: 'restock' });
            setRestockPromptVisible(false);
          }}
          actionButton={{
            label: FORKINATOR_RESTOCK_UNDO_BUTTON_LABEL,
            accessibilityLabel: FORKINATOR_RESTOCK_UNDO_BUTTON_A11Y_LABEL,
            onPress: handleRestockUndoPress,
          }}
        />
      ) : null}
      {expirationPromptLayout ? (
        <ForkinatorScannerPrompt
          layout={expirationPromptLayout}
          visible={shownPrompt === 'expiration' && cloudOpen && !tutorialActive}
          reduceMotion={reduceMotion}
          message={expirationExpirationMessage}
          accessibilityLabel={FORKINATOR_EXPIRATION_PROMPT_A11Y_LABEL}
          onPress={() => {
            logUsageEvent('forky_prompt_dismissed', { prompt: 'expiration' });
            recordForkyTipOutcome('expiration', 'dismissed');
            setExpirationPromptVisible(false);
          }}
          actionButton={{
            label: FORKINATOR_EXPIRATION_SHOW_BUTTON_LABEL,
            accessibilityLabel: FORKINATOR_EXPIRATION_SHOW_BUTTON_A11Y_LABEL,
            onPress: handleExpirationShowPress,
          }}
        />
      ) : null}
      {aisleSortPromptLayout ? (
        <ForkinatorScannerPrompt
          layout={aisleSortPromptLayout}
          visible={shownPrompt === 'aisleSort' && cloudOpen && !tutorialActive}
          reduceMotion={reduceMotion}
          message={FORKINATOR_AISLE_SORT_MESSAGE}
          accessibilityLabel={FORKINATOR_AISLE_SORT_A11Y_LABEL}
          onPress={() => {
            logUsageEvent('forky_prompt_dismissed', { prompt: 'aisleSort' });
            recordForkyTipOutcome('aisleSort', 'dismissed');
            setAisleSortPromptVisible(false);
          }}
          actionButton={{
            label: FORKINATOR_AISLE_SORT_BUTTON_LABEL,
            accessibilityLabel: FORKINATOR_AISLE_SORT_BUTTON_A11Y_LABEL,
            onPress: handleAisleSortPress,
          }}
        />
      ) : null}
      {forkInRoadCloudLayout ? (
        <ForkinatorScannerPrompt
          layout={forkInRoadCloudLayout}
          visible={forkInRoadPromptVisible && forkInRoadExpanded && !tutorialActive}
          reduceMotion={reduceMotion}
          message={FORKINATOR_FORK_IN_ROAD_MESSAGE}
          accessibilityLabel={FORKINATOR_FORK_IN_ROAD_A11Y_LABEL}
          onPress={() => {
            logUsageEvent('forky_prompt_dismissed', { prompt: 'forkInRoad' });
            collapseForkInRoadPrompt();
          }}
          actionButton={{
            label: FORKINATOR_FORK_IN_ROAD_BUTTON_LABEL,
            accessibilityLabel: FORKINATOR_FORK_IN_ROAD_BUTTON_A11Y_LABEL,
            onPress: handleForkInRoadHelpPress,
          }}
        />
      ) : null}
      {scannerPromptLayout ? (
        <ForkinatorScannerPrompt
          layout={scannerPromptLayout}
          visible={shownPrompt === 'scanner' && cloudOpen && !tutorialActive}
          reduceMotion={reduceMotion}
          message={FORKINATOR_SCANNER_NUDGE_MESSAGE}
          accessibilityLabel={FORKINATOR_SCANNER_NUDGE_A11Y_LABEL}
          onPress={() => {
            logUsageEvent('forky_prompt_tapped', { prompt: 'scanner' });
            recordForkyTipOutcome('scanner', 'tapped');
            setScannerPromptVisible(false);
            openPantryScannerFromForkinator();
          }}
          actionButton={{
            label: FORKINATOR_SCANNER_CAMERA_BUTTON_LABEL,
            accessibilityLabel: FORKINATOR_SCANNER_CAMERA_BUTTON_A11Y_LABEL,
            onPress: handleScannerCameraPress,
            icon: 'camera',
          }}
        />
      ) : null}
      <ForkInRoadQuizSheet
        visible={forkInRoadQuizVisible}
        candidateRows={forkInRoadCandidateRows}
        onClose={() => setForkInRoadQuizVisible(false)}
        onOpenRecipe={handleForkInRoadOpenRecipe}
      />
      {askForkyAvailable ? (
        <AskForkySheet
          visible={askForkyOpen}
          onClose={() => setAskForkyOpen(false)}
          onOpenRecipe={handleAskForkyOpenRecipe}
          onHelpMePick={handleForkInRoadHelpPress}
        />
      ) : null}
      {thinkDotsVisible
        ? forkinatorThinkDots(position).map((dot) => (
            <View
              key={dot.size}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: dot.left,
                top: dot.top,
                width: dot.size,
                height: dot.size,
                borderRadius: dot.size / 2,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: THEME.primary,
              }}
            />
          ))
        : null}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          width: FORKINATOR_PINNED_WIDTH_PX,
          height: FORKINATOR_PINNED_HEIGHT_PX,
        }}
      >
        {(Object.keys(FORKINATOR_MASCOT_POSE_SOURCES) as ForkinatorMascotPose[]).map((pose) => (
          <Image
            key={pose}
            source={FORKINATOR_MASCOT_POSE_SOURCES[pose]}
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: FORKINATOR_PINNED_WIDTH_PX,
                height: FORKINATOR_PINNED_HEIGHT_PX,
                opacity: pose === mascotPose ? 1 : 0,
              },
              imageWebStyle,
            ]}
            contentFit="contain"
            transition={0}
            accessibilityIgnoresInvertColors
            pointerEvents="none"
            onLoad={handleMascotImageLoad}
            {...(IS_WEB ? ({ draggable: false } as object) : null)}
          />
        ))}
        <Pressable
          onPress={handleMascotActivate}
          accessibilityRole="button"
          accessibilityLabel={FORKINATOR_ACCESSIBILITY_LABEL}
          accessibilityHint={FORKINATOR_ACCESSIBILITY_HINT}
          style={{
            position: 'absolute',
            left: -FORKINATOR_PINNED_HIT_PAD_LEFT_PX,
            top: 0,
            width: FORKINATOR_PINNED_HIT_WIDTH_PX,
            height: FORKINATOR_PINNED_HIT_HEIGHT_PX,
          }}
        />
      </View>
    </View>
  );
}
