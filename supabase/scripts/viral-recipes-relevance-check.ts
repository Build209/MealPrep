import assert from 'node:assert/strict';
import {
  ALL_VIRAL_RECIPE_CATEGORIES,
  CATEGORY_SEARCH_QUERIES,
  estimateRefreshQuotaUnits,
  isMostlyEnglishTitle,
  passesRecipeRelevanceFilter,
} from '../supabase/functions/viral-recipes/youtubeDiscovery.ts';

assert.ok(estimateRefreshQuotaUnits() <= 1500, 'refresh should stay under ~1500 quota units');

for (const category of ALL_VIRAL_RECIPE_CATEGORIES) {
  assert.ok(CATEGORY_SEARCH_QUERIES[category].length >= 2, `${category} should have multiple queries`);
}

assert.equal(isMostlyEnglishTitle('Easy 15 Minute Chicken Dinner'), true);
assert.equal(isMostlyEnglishTitle('आज पापा को चकमा'), false);

assert.equal(passesRecipeRelevanceFilter('Viral dinner recipe in 20 minutes', []), true);
assert.equal(passesRecipeRelevanceFilter('My daily minivlog in kitchen', []), false);
assert.equal(passesRecipeRelevanceFilter('Aaj Papa Ko Chakma De Diye', []), false);
assert.equal(passesRecipeRelevanceFilter('Choco Almonds snack haul', []), false);
assert.equal(passesRecipeRelevanceFilter('Random day in my life', []), false);

console.log('OK: viral-recipes relevance checks passed');
