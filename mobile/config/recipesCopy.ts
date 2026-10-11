/**
 * User-facing copy for the Recipes tab (screens import from here — no inline jargon).
 */

export type RecipesPantryFilterCopyId = 'best_match' | 'have_all' | 'missing_1_2' | 'all';

export const RECIPES_COPY = {
  mealsOnHomeLink: (count: number) => `Meals to make on Home (${count})`,

  /** Top line on the Home recipe toolbar when the creator feed is enabled. */
  homeToolbarCard: {
    subtitle:
      'Paste a video link or recipe text — or tap 📷 to snap a cookbook, magazine, or recipe card.',
    refreshRecipes: 'Refresh recipes',
    refreshUpdated: 'Updated',
    refreshOffline: "You're offline, showing saved recipes",
  },

  /** Home with an empty pantry: Forky asks for one photo (redesign, owner 2026-10-11). */
  homePantryPrompt: {
    heading: 'Show me your fridge.',
    description: "Take one photo. I list what's in it, then show you what you can cook tonight.",
    buttonLabel: 'Scan my fridge',
  },

  cookNowCard: {
    title: 'Cook now',
    subtitle: 'Meals you can make with what is already in your pantry',
    sortFilterLabel: 'Sort & filter',
    showDifferentIdeas: 'Show different ideas',
    emptyPantryBrowseHint: 'Add pantry items to see what you can make now',
  },

  pantryFilterLabels: {
    best_match: 'What you have most of',
    have_all: 'Have everything',
    missing_1_2: '1–2 missing',
    all: 'Show all',
  } satisfies Record<RecipesPantryFilterCopyId, string>,

  readyToCook: {
    title: 'Ready to cook',
    subtitle: 'Everything on hand — save a grocery run',
    discoveryTitle: 'Ready to cook from Recipe List',
    discoverySubtitle: 'Online recipes that match your pantry — tap to open details',
  },
  needAFewItems: {
    title: 'Need a few items',
    subtitle: 'Add missing ingredients to your list, then Smart Shop',
    discoveryTitle: 'Almost there from Recipe List',
    discoverySubtitle: 'A few groceries away — add missing items to your list in one tap',
  },

  moreIdeasCard: {
    title: 'More recipe ideas',
    subtitle: 'Picked using ingredients in your pantry',
    loading: 'Finding recipes for your ingredients…',
    empty:
      'No recipes yet that use enough of what you have. Add a few more pantry items or open Recipe List below for ideas.',
  },

  kitchenFilteredEmptyWithDiscovery:
    'Nothing in your saved recipes fits these filters yet. See more ideas below, or try relaxing the filters above.',

  pantryCheck: {
    title: 'Pantry check',
    youHave: 'You have',
    stillNeed: 'Still need',
    noPantryItemsYet: 'Nothing from your pantry lines up with this recipe yet.',
    readyToCook: 'Nothing — you are ready to cook.',
    addMissingCta: 'Add missing to grocery list',
  },

  mealPlanChip: {
    onPlan: 'In meals',
    add: 'Add to meals',
  },

  pantryEmptyCard: {
    title: 'Add pantry items first',
    subtitle: 'Recipes show up once we know what you have on hand',
    body:
      'Scan shelves or add items manually. We will suggest meals after your pantry has a few ingredients in it.',
    scanCta: 'Scan pantry',
    addCta: 'Add items',
  },

  discoveryPanel: {
    collapsedTitle: 'Recipe List',
    collapsedSubtitle: 'Optional search when you want new meal ideas beyond what your pantry suggests.',
    expandedIntro:
      'Search for new ideas when you want something different — we put recipes that use your ingredients near the top.',
    demoBannerTitle: 'Demo mode',
    demoBannerBody: 'Sample results only until you sign in with a connected account.',
    notSetupTitle: 'Not set up yet',
    notSetupBody: 'Recipe search is not connected yet. Ask an admin to finish setup, then try again.',
    searchPlaceholder: 'Search recipes (e.g. chicken, pasta…)',
    pantryOverlapSection: 'Use my pantry',
    matchMyPantryChip: 'Only what I have',
    discoverMinOverlapChips: {
      0: 'Any',
      50: 'About half',
      70: 'Most of it',
    } as const satisfies Record<0 | 50 | 70, string>,
    /** Shown when the app cannot obtain a recipe-proxy token (misconfigured build). Guests use the anon key. */
    searchNotAvailableInBuild: 'Recipe search is not available in this build.',
    idleHint:
      'Type a search or pick a filter to see results. Your pantry-based recipes stay listed above.',
    noFilterResults: 'No recipes fit these filters. Try a broader search or loosen the pantry filters.',
    searching: 'Searching…',
    resultCount: (count: number) => `${count} result${count === 1 ? '' : 's'}`,
    resultCountOfTotal: (shown: number, total: number) => `${shown} result${shown === 1 ? '' : 's'} (of ${total})`,
  },

  discoveryErrors: {
    loadFailed: 'Could not load recipe ideas right now. Your saved recipes are still above.',
    pantrySuggestionsUnavailable:
      'Recipe ideas are unavailable right now. Check your connection or try again shortly.',
    onlineUnavailable: 'Online recipes unavailable right now',
  },

  pantryOverlap: {
    youHave: (matched: number, total: number) => `You have ${matched} of ${total}`,
    needMore: (missing: number) => (missing === 1 ? 'Need 1 more' : `Need ${missing} more`),
    readyToCook: 'Ready to cook',
  },

  cookFromPantryCard: {
    title: 'Cook from your pantry',
    subtitle: 'Use what you have — fewer store runs',
    addMissingShort: 'Add missing to list',
    seeAllOnRecipes: 'See all recipes',
  },

  recipeCard: {
    addMissingCta: 'Add missing to grocery list',
    haveEverything: 'Ready to cook! 🎉',
    checkingPantry: 'Checking pantry…',
    lookupFailed: "Couldn't load — tap to retry",
    lookupBookmarkNotReady: 'Still loading — try again in a moment',
    offlineDetailsUnavailable: "This recipe isn't saved on your device yet. Go online to open it.",
    previewNoIngredients: 'Get the recipe from this video to see ingredients',
    needItems: (count: number) => (count === 1 ? 'Missing 1 item' : `Missing ${count} items`),
  },

  recipeDetail: {
    wontCookAgain: "Won't cook again",
    wontCookAgainUndo: 'Undo hide',
    ingredientsTab: 'Ingredients',
    stepsTab: 'Steps',
    servingsAndTime: (servings: number, minutes: number) =>
      `${Math.max(1, servings)} servings · ${Math.max(1, minutes)} min`,
    stepLabel: (index: number) => `Step ${index + 1}`,
    costPerServingAbout: (formatted: string) => `About ${formatted} per serving`,
    costEstimateMeta: (unpricedCount: number, assumedDefaultServings: boolean) => {
      const parts = ['Estimate'];
      if (unpricedCount > 0) {
        parts.push(
          unpricedCount === 1 ? '1 item not priced' : `${unpricedCount} items not priced`,
        );
      }
      if (assumedDefaultServings) {
        parts.push('4 servings assumed');
      }
      return parts.join(' · ');
    },
    costPerServingAccessibility: (costPerServing: number, unpricedCount: number) =>
      `Estimated cost about $${costPerServing.toFixed(2)} per serving. ${unpricedCount} ingredients not priced.`,
    costBreakdownTotal: (servings: number) => `Total (${servings} servings)`,
  },
} as const;

/** Compact label for recipe list badges (no percentages). */
export function recipePantryBadgeLabel(
  matchedCount: number,
  totalIngredients: number,
  missingCount: number,
): string {
  if (missingCount === 0) {
    return RECIPES_COPY.pantryOverlap.readyToCook;
  }
  return `${RECIPES_COPY.pantryOverlap.youHave(matchedCount, totalIngredients)} · ${RECIPES_COPY.pantryOverlap.needMore(missingCount)}`;
}

/** Secondary line under a recipe name on home / recommendation rows. */
export function recipePantryListSubtitle(
  matchedCount: number,
  totalIngredients: number,
  missingCount: number,
): string {
  if (missingCount === 0) {
    return `${RECIPES_COPY.pantryOverlap.youHave(matchedCount, totalIngredients)} — ${RECIPES_COPY.pantryOverlap.readyToCook.toLowerCase()}`;
  }
  return `${RECIPES_COPY.pantryOverlap.youHave(matchedCount, totalIngredients)} · ${RECIPES_COPY.pantryOverlap.needMore(missingCount)}`;
}
