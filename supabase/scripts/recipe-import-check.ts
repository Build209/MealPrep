import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIso8601DurationToMinutes, parseRecipeYieldToServings } from '../functions/recipe-import/durationParse.ts';
import {
  findRecipeJsonLdInHtml,
  recipeJsonLdToExtracted,
} from '../functions/recipe-import/jsonLdParser.ts';
import { validateGeminiRecipeImportPayload } from '../functions/recipe-import/recipeImportSchema.ts';
import {
  canonicalYouTubeWatchUrl,
  classifyRecipeImportUrl,
  isManualCaptionSourceType,
  isSocialCaptionSourceType,
  normalizeImportUrl,
} from '../functions/recipe-import/urlClassification.ts';
import { orderImportFallbackSteps } from '../functions/recipe-import/fallbackChain.ts';
import { parseTikTokOembedPayload } from '../functions/recipe-import/tiktokOembed.ts';
import { parseYouTubeOembedPayload } from '../functions/recipe-import/youtubeCreatorMeta.ts';
import { extractPageAuthorFromHtml } from '../functions/recipe-import/pageAuthorMeta.ts';
import {
  extractOgImageFromHtml,
  resolveYouTubeImportImageUrl,
  youtubeHqDefaultThumbnailUrl,
} from '../functions/recipe-import/recipeImageMeta.ts';
import { recipeMissingCreatorFields } from '../functions/recipe-import/creatorAttribution.ts';
import { buildYoutubeSearchQuery, guessDishQueryFromCaption } from '../functions/recipe-import/dishGuess.ts';
import {
  isAllowedHttpPort,
  isBlockedHostname,
  isBlockedIpv4Host,
  isBlockedIpv6Host,
  resolveRedirectLocation,
  validatePublicHttpFetchUrl,
} from '../functions/recipe-import/ssrfGuard.ts';
import { validateUserImportStoragePath } from '../functions/recipe-import/storagePathValidation.ts';
import {
  parseRuleBasedRecipeFromText,
  recipeSignalsInText,
} from '../functions/recipe-import/textRecipeParse.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures/recipe-import-jsonld');
assert.equal(parseIso8601DurationToMinutes('PT15M'), 15);
assert.equal(parseIso8601DurationToMinutes('PT1H30M'), 90);
assert.equal(parseRecipeYieldToServings('6 servings'), 6);
assert.equal(parseRecipeYieldToServings(['4', '6']), 4);

assert.equal(classifyRecipeImportUrl('https://www.youtube.com/watch?v=abc'), 'youtube');
assert.equal(classifyRecipeImportUrl('https://youtu.be/abc'), 'youtube');
assert.equal(classifyRecipeImportUrl('https://www.allrecipes.com/recipe/1/'), 'web');
assert.equal(classifyRecipeImportUrl('https://www.tiktok.com/@chef/video/1'), 'tiktok');
assert.equal(classifyRecipeImportUrl('https://www.instagram.com/reel/abc/'), 'instagram');
assert.equal(classifyRecipeImportUrl('https://www.facebook.com/watch/?v=1'), 'facebook');
assert.equal(classifyRecipeImportUrl('https://fb.watch/abc/'), 'facebook');
assert.equal(
  classifyRecipeImportUrl('https://www.reddit.com/r/recipes/comments/abc123/title/'),
  'reddit',
);
assert.equal(classifyRecipeImportUrl('https://old.reddit.com/r/recipes/comments/abc123/t/'), 'reddit');
assert.equal(classifyRecipeImportUrl('https://redd.it/abc123'), 'reddit');
const redditRecipeBody = `Ingredients:
- 2 cups flour
- 1 cup sugar
- 1/2 cup butter

Instructions:
1. Mix dry ingredients.
2. Bake at 350F for 25 minutes.`;
assert.equal(recipeSignalsInText(redditRecipeBody), true);
assert.ok(parseRuleBasedRecipeFromText('Sheet cake', redditRecipeBody));
assert.equal(isSocialCaptionSourceType('tiktok'), true);
assert.equal(isManualCaptionSourceType('facebook'), true);
assert.equal(
  canonicalYouTubeWatchUrl('https://youtu.be/xyz123'),
  'https://www.youtube.com/watch?v=xyz123',
);

const normalized = normalizeImportUrl('allrecipes.com/recipe/123');
assert.ok(normalized?.startsWith('https://'));

assert.equal(normalizeImportUrl('http://127.0.0.1/recipe'), null);
assert.equal(normalizeImportUrl('http://localhost/x'), null);
assert.equal(normalizeImportUrl('http://10.0.0.1/x'), null);
assert.equal(normalizeImportUrl('http://192.168.1.1/x'), null);
assert.equal(normalizeImportUrl('http://169.254.1.1/x'), null);
assert.equal(normalizeImportUrl('http://100.64.0.1/x'), null);
assert.equal(normalizeImportUrl('http://172.16.0.1/x'), null);
assert.equal(normalizeImportUrl('http://0.1.2.3/x'), null);
assert.equal(normalizeImportUrl('http://[::1]/x'), null);
assert.equal(normalizeImportUrl('http://server.local/recipe'), null);
assert.equal(normalizeImportUrl('http://api.internal/x'), null);
assert.equal(normalizeImportUrl('http://user:pass@example.com/x'), null);
assert.equal(normalizeImportUrl('http://example.com:8080/x'), null);
assert.equal(validatePublicHttpFetchUrl('https://example.com:443/x').ok, true);
assert.equal(validatePublicHttpFetchUrl('https://example.com:8443/x').ok, false);

assert.equal(isBlockedIpv4Host('127.0.0.1'), true);
assert.equal(isBlockedIpv4Host('8.8.8.8'), false);
assert.equal(isBlockedIpv6Host('::1'), true);
assert.equal(isBlockedIpv6Host('fe80::1'), true);
assert.equal(isBlockedIpv6Host('fc00::1'), true);
assert.equal(isBlockedHostname('app.local'), true);

const okHttps = validatePublicHttpFetchUrl('https://www.allrecipes.com/recipe/1/');
assert.equal(okHttps.ok, true);
const redirectResolved = resolveRedirectLocation(
  new URL('https://example.com/a'),
  '/b',
);
assert.equal(redirectResolved, 'https://example.com/b');
assert.equal(
  isAllowedHttpPort(new URL('http://example.com:80/path')),
  true,
);

const graphFixture = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'allrecipes-graph.json'), 'utf8'),
);
const graphHtml = `<html><script type="application/ld+json">${JSON.stringify(graphFixture)}</script></html>`;
const graphNode = findRecipeJsonLdInHtml(graphHtml);
assert.ok(graphNode);
const graphRecipe = recipeJsonLdToExtracted(graphNode!, 'https://example.com/garlic-bread');
assert.ok(graphRecipe);
assert.equal(graphRecipe!.title, 'Easy Garlic Bread');
assert.equal(graphRecipe!.ingredients.length, 3);
assert.equal(graphRecipe!.steps.length, 2);
assert.equal(graphRecipe!.prep_minutes, 10);
assert.equal(graphRecipe!.cook_minutes, 12);

const sectionFixture = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'howto-section.json'), 'utf8'),
);
const sectionRecipe = recipeJsonLdToExtracted(sectionFixture, 'https://example.com/soup');
assert.ok(sectionRecipe);
assert.equal(sectionRecipe!.steps.length, 2);
assert.equal(sectionRecipe!.servings, 4);

const geminiPayload = validateGeminiRecipeImportPayload({
  title: 'Test',
  servings: 2,
  prep_minutes: 5,
  cook_minutes: 10,
  ingredients: [{ name: 'salt', quantity: 1, unit: 'tsp' }],
  steps: ['Mix', 'Serve'],
  is_recipe: true,
  confidence: 0.8,
  youtube_channel_name: 'Test Kitchen',
});
assert.ok(geminiPayload);
assert.equal(geminiPayload!.ingredients[0].name, 'salt');

const rejected = validateGeminiRecipeImportPayload({ title: '' });
assert.equal(rejected, null);


assert.equal(validateUserImportStoragePath('user-abc', 'user-abc/photo-1.jpg'), true);
assert.equal(validateUserImportStoragePath('user-abc', 'other-user/photo-1.jpg'), false);
assert.equal(validateUserImportStoragePath('user-abc', 'user-abc/../other/photo.jpg'), false);

const oembed = parseTikTokOembedPayload({
  title: 'Garlic noodles #dinner',
  author_name: 'Chef Pat',
  author_url: 'https://www.tiktok.com/@chefpat',
});
assert.ok(oembed);
assert.equal(oembed!.caption.includes('Garlic'), true);
assert.equal(oembed!.authorName, 'Chef Pat');

assert.equal(guessDishQueryFromCaption('Best ever tacos 🌮 #food'), 'Best ever tacos');
assert.ok(buildYoutubeSearchQuery('Chef Pat', 'Garlic noodles').includes('recipe'));

const serverSteps = orderImportFallbackSteps({
  sourceType: 'instagram',
  hasCaption: false,
  youtubeSuggestionAvailable: true,
});
assert.deepEqual(serverSteps.slice(0, 2), ['youtube_confirm', 'video_upload']);


const ytOembed = parseYouTubeOembedPayload({
  author_name: 'Chef Channel',
  author_url: 'https://www.youtube.com/@chef',
});
assert.equal(ytOembed?.channelName, 'Chef Channel');
assert.equal(ytOembed?.channelUrl, 'https://www.youtube.com/@chef');

const authorHtml =
  '<html><head><meta property="og:site_name" content="Serious Eats" /></head><body></body></html>';
assert.equal(
  extractPageAuthorFromHtml(authorHtml, 'https://www.example.com/recipe')?.authorName,
  'Serious Eats',
);


const jsonLdAuthorHtml = `<html><head><script type="application/ld+json">{"author":{"name":"Pat","url":"/profile/pat"}}</script></head></html>`;
const jsonLdAuthor = extractPageAuthorFromHtml(
  jsonLdAuthorHtml,
  'https://recipes.example.com/dish',
);
assert.equal(jsonLdAuthor?.authorName, 'Pat');
assert.equal(jsonLdAuthor?.authorUrl, 'https://recipes.example.com/profile/pat');

assert.equal(
  recipeMissingCreatorFields(
    { youtube_channel_name: 'A', youtube_channel_url: 'https://youtube.com/@a' } as import('../functions/recipe-import/recipeImportSchema.ts').RecipeImportExtracted,
    'youtube',
  ),
  false,
);
assert.equal(
  recipeMissingCreatorFields(
    { youtube_channel_name: null, youtube_channel_url: null } as import('../functions/recipe-import/recipeImportSchema.ts').RecipeImportExtracted,
    'youtube',
  ),
  true,
);


assert.equal(
  youtubeHqDefaultThumbnailUrl('abc123XYZ'),
  'https://i.ytimg.com/vi/abc123XYZ/hqdefault.jpg',
);
const ogHtml =
  '<html><head><meta property="og:image" content="https://cdn.example.com/dish.jpg" /></head></html>';
assert.equal(
  extractOgImageFromHtml(ogHtml, 'https://www.example.com/recipe'),
  'https://cdn.example.com/dish.jpg',
);
assert.equal(
  extractOgImageFromHtml(
    '<html><head><meta property="og:image" content="/images/dish.jpg" /></head></html>',
    'https://www.example.com/recipe/page',
  ),
  'https://www.example.com/images/dish.jpg',
);

// The old app's client half (lib/recipeImport, the import box, the share target): mobile/scripts/recipe-import-mobile-check.ts.

console.log('OK: recipe-import checks passed');
