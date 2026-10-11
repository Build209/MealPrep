/** Recipes tab creator row + Classic category row (rotation spec). */

export const RECIPES_TAB_SURFACE = {
  /** New visit if Recipes tab render is this long after the last visit, or after cold start. */
  visitGapMs: 10 * 60 * 1000,
  visitStateStorageKey: 'mealprep.recipesTab.visitState',
  sectionExpandedStorageKey: 'mealprep.recipesTab.sectionExpanded',
  surfaceEventsStoragePrefix: 'mealprep.recipesTab.surfaceEvents',
  /**
   * Both Home sections start folded: just the name and an arrow (owner, 2026-10-11, 2:03 pm).
   * Their chips and avatars show once the section is opened.
   */
  defaultClassicExpanded: false,
  defaultCreatorsExpanded: false,
  explorationSwapProbability: 0.3,
  minLifetimeImpressionsForExploration: 3,
  minPassRateToShow: 0.2,
  dietPassRateHalfPoint: 0.5,
  creatorMissHalfLifeDays: 14,
  creatorTasteHalfLifeDays: 30,
  categoryImpressionFatigueHalfLifeDays: 7,
} as const;

export const MEALDB_CATEGORY_ORDER_COLD_START = [
  'Chicken',
  'Beef',
  'Pasta',
  'Vegetarian',
  'Seafood',
  'Breakfast',
  'Dessert',
  'Pork',
  'Side',
  'Starter',
  'Vegan',
  'Lamb',
  'Goat',
  'Miscellaneous',
] as const;

/** Always shown on Home classic row (diet filters may hide some). */
export const HOME_CLASSIC_CATEGORY_CHIPS: readonly MealDbCatalogCategory[] = [
  'Chicken',
  'Beef',
  'Pork',
  'Seafood',
  'Pasta',
  'Vegetarian',
  'Vegan',
  'Breakfast',
  'Dessert',
];

export const MEALDB_CATALOG_CATEGORIES = [
  'Beef',
  'Breakfast',
  'Chicken',
  'Dessert',
  'Goat',
  'Lamb',
  'Miscellaneous',
  'Pasta',
  'Pork',
  'Seafood',
  'Side',
  'Starter',
  'Vegan',
  'Vegetarian',
] as const;

export type MealDbCatalogCategory = (typeof MEALDB_CATALOG_CATEGORIES)[number];

export const RECIPES_TAB_SURFACE_COPY = {
  classicSectionTitle: 'See more curated recipes!',
  creatorsSectionTitle: 'See more creator recipes!',
  /** Approved Home design: page heading and the short section headings shown on screen. */
  homeHeading: "What's for dinner?",
  pantrySectionHeading: 'From your pantry',
  creatorsSectionHeading: 'Creators',
  seePantryLink: 'See pantry',
  allCategoriesChip: 'All',
  categoryRowAccessibility: 'Browse classic recipes by category',
} as const;
