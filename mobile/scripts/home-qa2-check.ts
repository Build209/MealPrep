/**
 * Home QA round 2 (N1–N5, items 8–10, 16 hook): static logic checks.
 * Run from mobile/: npm run test:home-qa2
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Recipe } from '../types/mealprep';
import { CREATOR_RECIPES_COPY } from '../config/creatorRecipes';
import { MEALDB_COPY } from '../config/mealdb';
import { RECIPES_COPY } from '../config/recipesCopy';
import { touchPageYFromNativeEvent } from '../lib/home/touchPageY';
import { kitchenCategoryRowsAvailableOffline } from '../lib/mealdb/offlineCategoryRows';
import { recipesTabRowsFromFilterSummaries } from '../lib/mealdb/categoryStubRows';
import { writeJson } from '../lib/storage';
import { MEALDB } from '../config/mealdb';
import { mealDbMealToAppRecipe } from '../lib/mealdb/normalize';
import type { MealDbMealDetail } from '../lib/mealdb/types';
import { resetMealDbClientCacheForTests } from '../lib/mealdb/client';
import {
  shouldHideCreatorDescriptionForDietPrefs,
  shouldHideCreatorModelForDietPrefs,
} from '../lib/diet/creatorAllergenCheck';
import type { UserDietPrefs } from '../lib/diet/types';
import type { CreatorFeedCardModel } from '../lib/recipes/creatorFeedRows';
import {
  buildMealPickerRecipeOptions,
} from '../lib/mealCalendar/recipePickerOptions';
import { recipeSuitsMealPickerSlot } from '../lib/mealCalendar/mealPickerSlotFilter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');

// N1 — touch pageY extraction
const moveY = touchPageYFromNativeEvent(
  { touches: [{ pageY: 120, clientY: 100 }] },
  'move',
);
assert.equal(moveY, 120);
const endY = touchPageYFromNativeEvent(
  { changedTouches: [{ clientY: 88 }] },
  'end',
);
assert.equal(endY, 88);

const scrollRefreshWeb = fs.readFileSync(
  path.join(mobileRoot, 'hooks/useHomeScrollRefresh.web.tsx'),
  'utf8',
);
assert.match(scrollRefreshWeb, /touchPageYFromNativeEvent/);
assert.match(scrollRefreshWeb, /PULL_THRESHOLD_PX = 80/);

// N2 — offline category rows
resetMealDbClientCacheForTests();
const stubs = recipesTabRowsFromFilterSummaries(
  [
    { idMeal: '1', strMeal: 'Cached', strMealThumb: 'https://example.com/a.jpg' },
    { idMeal: '2', strMeal: 'Missing', strMealThumb: 'https://example.com/b.jpg' },
  ],
  'Breakfast',
);
const mealDetail: MealDbMealDetail = {
  idMeal: '1',
  strMeal: 'Cached',
  strCategory: 'Breakfast',
  strMealThumb: 'https://example.com/a.jpg',
  strInstructions: 'Mix.',
  strIngredient1: 'egg',
  strMeasure1: '1',
};
writeJson(`${MEALDB.cacheKeyPrefix}:lookup.php?i=1`, {
  payload: { meals: [mealDetail] },
  expiresAt: Date.now() + 60_000,
  cachedAtMs: Date.now(),
});
const offlineRows = kitchenCategoryRowsAvailableOffline(stubs, []);
assert.equal(offlineRows.length, 1);
assert.equal(offlineRows[0]?.recipe.name, 'Cached');
assert.equal(MEALDB_COPY.categoryOfflineEmpty, "This category isn't available offline yet");

// N3 — masked stub hides image
const feedCard = fs.readFileSync(
  path.join(mobileRoot, 'components/recipes/RecipesUnifiedFeedCard.tsx'),
  'utf8',
);
assert.match(feedCard, /maskImage/);
assert.match(feedCard, /maskImage \?/);

// N4 — creator title-only dish keywords
const peanutPrefs: UserDietPrefs = {
  diets: [],
  allergens: ['peanuts'],
  dislikes: [],
  hideConflicts: true,
};
const quickDinnersModel = {
  videoId: 'v1',
  item: { videoId: 'v1', title: '1 Hour of Quick Dinners (30 Minute or Less!)', channelTitle: 'Allrecipes' },
  video: {
    videoId: 'v1',
    title: '1 Hour of Quick Dinners (30 Minute or Less!)',
    descriptionSnippet: 'Includes Air Fryer Bang Bang Salmon with sweet chili mayo.',
    channelId: 'ch',
    channelTitle: 'Allrecipes',
    publishedAt: '',
    thumbnailUrl: '',
  },
  importedRecipe: null,
} as CreatorFeedCardModel;
assert.ok(
  !shouldHideCreatorModelForDietPrefs(peanutPrefs, quickDinnersModel),
  'bang bang in creator description should not block',
);
assert.ok(
  shouldHideCreatorDescriptionForDietPrefs(peanutPrefs, 'made with peanut butter sauce'),
  'peanut butter in description should still block',
);

// N5 — Updated tied to spinner, not prefetch await
const refreshHook = fs.readFileSync(path.join(mobileRoot, 'hooks/useHomeRecipesRefresh.ts'), 'utf8');
assert.match(refreshHook, /REFRESH_SPINNER_MAX_MS/);
assert.ok(
  !/prefetchOk/.test(refreshHook),
  'refresh should not wait for prefetch before showing Updated',
);
assert.match(refreshHook, /setStatusMessage\(RECIPES_COPY\.homeToolbarCard\.refreshUpdated\)/);

// Item 8 — dinner slot filter
function kitchenRecipe(partial: Partial<Recipe> & Pick<Recipe, 'id' | 'name'>): Recipe {
  return {
    tag: partial.tag ?? 'Chicken',
    description: '',
    servings: 4,
    minutes: 30,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    ingredients: partial.ingredients ?? [{ name: 'salt', quantity: 1, unit: 'tsp' }],
    steps: [],
    isMaster: true,
    createdAt: '',
    ...partial,
  };
}
const boterkoek = kitchenRecipe({ id: 'c1', name: 'Boterkoek', tag: 'Dessert' });
const aebleskiver = kitchenRecipe({ id: 'c2', name: 'Æbleskiver', tag: 'Dessert' });
const sweetBread = kitchenRecipe({ id: 'c3', name: 'Bajan Sweet Bread', tag: 'Caribbean · Dessert' });
const avocadoSauce = kitchenRecipe({ id: 'c4', name: 'Ají de Aguacate', tag: 'Starter' });
assert.ok(!recipeSuitsMealPickerSlot(boterkoek, 'dinner'));
assert.ok(!recipeSuitsMealPickerSlot(aebleskiver, 'dinner'));
assert.ok(!recipeSuitsMealPickerSlot(sweetBread, 'dinner'));
assert.ok(!recipeSuitsMealPickerSlot(avocadoSauce, 'dinner'));

const dinnerPicker = buildMealPickerRecipeOptions(
  [boterkoek, aebleskiver, sweetBread, avocadoSauce, kitchenRecipe({ id: 'm1', name: 'Roast Chicken', tag: 'Chicken' })],
  [],
  20,
  new Set(),
  [],
  { mealSlot: 'dinner' },
);
const dinnerTitles = dinnerPicker.map((row) => row.title);
assert.ok(!dinnerTitles.includes('Boterkoek'));
assert.ok(!dinnerTitles.includes('Æbleskiver'));
assert.ok(!dinnerTitles.includes('Bajan Sweet Bread'));
assert.ok(!dinnerTitles.includes('Ají de Aguacate'));

// Item 9 — search hint lifecycle
assert.equal(CREATOR_RECIPES_COPY.searchTypingHint, 'Type one more letter to search.');
const searchHook = fs.readFileSync(path.join(mobileRoot, 'hooks/useUnifiedRecipeSearch.ts'), 'utf8');
assert.match(searchHook, /debouncing/);
const homeIndex = fs.readFileSync(path.join(mobileRoot, 'app/(tabs)/index.tsx'), 'utf8');
assert.match(homeIndex, /searchInFlight/);
assert.match(homeIndex, /creatorFeedEnabled \|\| searching\) return \[\]/);
assert.match(homeIndex, /emptySearchForQuery/);

// Item 10 — pantry CTA pressed state
const pantryCta = fs.readFileSync(path.join(mobileRoot, 'components/home/HomePantryCta.tsx'), 'utf8');
assert.match(pantryCta, /onPressIn/);
assert.match(pantryCta, /tomatoDark/);
assert.match(pantryCta, /0\.96/);

// Item 16 — engagement index waits for hydration
const rankingHook = fs.readFileSync(path.join(mobileRoot, 'hooks/useRecipeRanking.ts'), 'utf8');
assert.match(rankingHook, /emptyEngagementIndexForGhost/);
assert.match(rankingHook, /if \(!hydrated\) return/);

console.log('home-qa2-check: ok');
