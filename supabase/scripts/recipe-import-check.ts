import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIso8601DurationToMinutes, parseRecipeYieldToServings } from '../supabase/functions/recipe-import/durationParse.ts';
import {
  findRecipeJsonLdInHtml,
  recipeJsonLdToExtracted,
} from '../supabase/functions/recipe-import/jsonLdParser.ts';
import { validateGeminiRecipeImportPayload } from '../supabase/functions/recipe-import/recipeImportSchema.ts';
import {
  canonicalYouTubeWatchUrl,
  classifyRecipeImportUrl,
  isManualCaptionSourceType,
  isSocialCaptionSourceType,
  normalizeImportUrl,
} from '../supabase/functions/recipe-import/urlClassification.ts';
import { orderImportFallbackSteps } from '../supabase/functions/recipe-import/fallbackChain.ts';
import { parseTikTokOembedPayload } from '../supabase/functions/recipe-import/tiktokOembed.ts';
import { parseYouTubeOembedPayload } from '../supabase/functions/recipe-import/youtubeCreatorMeta.ts';
import { extractPageAuthorFromHtml } from '../supabase/functions/recipe-import/pageAuthorMeta.ts';
import {
  extractOgImageFromHtml,
  resolveYouTubeImportImageUrl,
  youtubeHqDefaultThumbnailUrl,
} from '../supabase/functions/recipe-import/recipeImageMeta.ts';
import {
  isAllowedHttpUrlString,
  resolveAndSanitizeHttpUrl,
  sanitizeHttpUrl,
} from '../lib/recipeImport/safeHttpUrl.ts';
import { recipeMissingCreatorFields } from '../supabase/functions/recipe-import/creatorAttribution.ts';
import { sourceCreditFromImportDto } from '../lib/recipeImport/sourceCredit.ts';
import { buildYoutubeSearchQuery, guessDishQueryFromCaption } from '../supabase/functions/recipe-import/dishGuess.ts';
import {
  isAllowedHttpPort,
  isBlockedHostname,
  isBlockedIpv4Host,
  isBlockedIpv6Host,
  resolveRedirectLocation,
  validatePublicHttpFetchUrl,
} from '../supabase/functions/recipe-import/ssrfGuard.ts';
import { youtubeVideoIdFromUrl } from '../lib/recipeImport/youtube.ts';
import {
  sanitizeRecipeImageUrl,
  youtubeHqDefaultThumbnailUrl as clientYoutubeThumb,
  youtubeThumbnailUrlFromWatchUrl,
} from '../lib/recipeImport/youtubeThumbnail.ts';
import { kitchenRecipeFeedMetaLine } from '../lib/recipes/recipeImageUrl.ts';
import { classifyImportUrlForClient, isManualCaptionImportKind } from '../lib/recipeImport/urlClassificationClient.ts';
import { orderImportFallbackSteps as orderImportFallbackStepsClient } from '../lib/recipeImport/fallbackChain.ts';
import { shareTargetImportRoute } from '../lib/recipeImport/client.ts';
import { extractUrlFromClipboardText } from '../lib/recipeImport/extractUrlFromClipboardText.ts';
import { parseImportInput } from '../lib/recipeImport/parseImportInput.ts';
import { RECIPE_IMPORT } from '../config/recipeImport.ts';
import { validateUserImportStoragePath } from '../supabase/functions/recipe-import/storagePathValidation.ts';
import {
  applyRedditCreditToImport,
  buildRedditCreditLabel,
  findRedditUrlInText,
  isRedditImportUrl,
  parseAuthorFromRecipeText,
  parseSubredditFromRedditUrl,
  resolveRedditImportContext,
  stripRedditUrlsFromText,
} from '../lib/recipeImport/redditClient.ts';
import {
  parseRuleBasedRecipeFromText,
  recipeSignalsInText,
} from '../supabase/functions/recipe-import/textRecipeParse.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../test-fixtures/recipe-import-jsonld');
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
assert.equal(classifyImportUrlForClient('https://www.reddit.com/r/recipes/s/AbCdEf'), 'reddit');
assert.equal(isRedditImportUrl('https://www.reddit.com/r/recipes/comments/abc123/title/'), true);
assert.equal(
  findRedditUrlInText('Check https://www.reddit.com/r/recipes/comments/abc123/t/ for soup'),
  'https://www.reddit.com/r/recipes/comments/abc123/t/',
);
assert.equal(parseSubredditFromRedditUrl('https://www.reddit.com/r/recipes/comments/abc123/t/'), 'recipes');
assert.equal(parseAuthorFromRecipeText('Posted by u/chef_user — great thread'), 'chef_user');
assert.equal(buildRedditCreditLabel('recipes', 'chef_user'), 'Recipe from u/chef_user · r/recipes');
assert.equal(buildRedditCreditLabel('Cooking', null), 'From r/Cooking');
const redditRecipeBody = `Ingredients:
- 2 cups flour
- 1 cup sugar
- 1/2 cup butter

Instructions:
1. Mix dry ingredients.
2. Bake at 350F for 25 minutes.`;
assert.equal(recipeSignalsInText(redditRecipeBody), true);
assert.ok(parseRuleBasedRecipeFromText('Sheet cake', redditRecipeBody));
const redditCtx = resolveRedditImportContext(
  `https://www.reddit.com/r/recipes/comments/abc123/cake/\n\n${redditRecipeBody}`,
  null,
)!;
assert.equal(redditCtx.subreddit, 'recipes');
const credited = applyRedditCreditToImport(
  {
    title: 'Cake',
    servings: 4,
    prep_minutes: null,
    cook_minutes: null,
    ingredients: [],
    steps: [],
    is_recipe: true,
    confidence: 1,
    source_url: 'text-import',
    source_type: 'web',
  },
  redditCtx,
);
assert.equal(credited.source_type, 'reddit');
assert.equal(stripRedditUrlsFromText('https://redd.it/abc ' + redditRecipeBody).includes('Ingredients'), true);
assert.equal(isSocialCaptionSourceType('tiktok'), true);
assert.equal(isManualCaptionSourceType('facebook'), true);
assert.equal(isManualCaptionImportKind('instagram'), true);
assert.equal(classifyImportUrlForClient('https://m.facebook.com/reel/1'), 'facebook');
assert.equal(youtubeVideoIdFromUrl('https://youtu.be/abcd1234efg'), 'abcd1234efg');
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

assert.equal(
  extractUrlFromClipboardText('Check this https://example.com/recipe) out'),
  'https://example.com/recipe',
);
assert.equal(extractUrlFromClipboardText('no link here'), null);

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

const clientSteps = orderImportFallbackStepsClient({
  sourceType: 'instagram',
  hasCaption: false,
  youtubeSuggestionAvailable: false,
});
assert.ok(clientSteps.includes('paste_caption'));

const shareRoute = shareTargetImportRoute({
  text: 'Check this https://www.youtube.com/watch?v=abc123 extra',
});
assert.equal(shareRoute.path, '/');
assert.equal(shareRoute.query.import, '1');
assert.equal(shareRoute.query.url?.includes('youtube.com'), true);

const pwaScript = fs.readFileSync(
  path.join(__dirname, '../scripts/generate-pwa-assets.mjs'),
  'utf8',
);
assert.ok(pwaScript.includes('share_target'));
assert.ok(pwaScript.includes('import=1'));

const parsedLink = parseImportInput('https://www.tiktok.com/@chef/video/1');
assert.equal(parsedLink?.kind, 'url');
const parsedText = parseImportInput('Ingredients: 2 cups flour. Mix and bake at 350 for 30 minutes. Serve warm.');
assert.equal(parsedText?.kind, 'text');
const parsedCombo = parseImportInput(
  'https://www.instagram.com/reel/abc/ Best tacos ever with lime and cilantro and onion diced fine',
);
assert.equal(parsedCombo?.kind, 'url');
if (parsedCombo?.kind === 'url') {
  assert.ok(parsedCombo.caption && parsedCombo.caption.includes('tacos'));
}

const importBoxSource = fs.readFileSync(
  path.join(__dirname, '../components/recipes/RecipeImportBox.tsx'),
  'utf8',
);
assert.ok(
  !/useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*getStringAsync/.test(importBoxSource),
  'RecipeImportBox must not auto-read clipboard on mount',
);
assert.ok(
  !importBoxSource.includes('getStringAsync') && !importBoxSource.includes('pasteImportLink'),
  'RecipeImportBox must not read the clipboard',
);
assert.ok(
  importBoxSource.includes('pickRecipeImportPhotoFromCamera'),
  'RecipeImportBox should open camera / photo picker for cookbook import',
);
assert.ok(
  !importBoxSource.includes('Alert.alert'),
  'RecipeImportBox must not use Alert.alert (broken on web/PWA)',
);
const homeSource = fs.readFileSync(path.join(__dirname, '../app/(tabs)/index.tsx'), 'utf8');
assert.ok(
  homeSource.includes('RECIPES_COPY.homeToolbarCard.subtitle'),
  'Home toolbar should show paste/snap hint above import',
);
assert.ok(
  !importBoxSource.includes('importBoxHint'),
  'RecipeImportBox should not duplicate paste/snap hint under Import',
);

const pickPhotoNative = fs.readFileSync(
  path.join(__dirname, '../lib/recipeImport/pickRecipeImportPhoto.ts'),
  'utf8',
);
const pickPhotoWeb = fs.readFileSync(
  path.join(__dirname, '../lib/recipeImport/pickRecipeImportPhoto.web.ts'),
  'utf8',
);
assert.ok(
  pickPhotoNative.includes('preparePantryImage') && pickPhotoNative.includes('RECIPE_IMPORT_PHOTO_PREPARE'),
  'Native recipe photo pick should resize via preparePantryImage',
);
assert.ok(
  pickPhotoWeb.includes('preparePantryImageFromFile') && pickPhotoWeb.includes('RECIPE_IMPORT_PHOTO_PREPARE'),
  'Web recipe photo pick should resize via preparePantryImageFromFile',
);
assert.equal(RECIPE_IMPORT.photoUploadMaxLongEdge, 1600);
assert.equal(RECIPE_IMPORT.photoUploadJpegQuality, 0.8);

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

assert.equal(sanitizeHttpUrl('https://www.youtube.com/@chef'), 'https://www.youtube.com/@chef');
assert.equal(sanitizeHttpUrl('javascript:alert(1)'), null);
assert.equal(sanitizeHttpUrl('data:text/html,<script>'), null);
assert.equal(isAllowedHttpUrlString('http://example.com/path'), true);
assert.equal(
  resolveAndSanitizeHttpUrl('/author/chef', 'https://blog.example.com/recipe/1'),
  'https://blog.example.com/author/chef',
);
assert.equal(
  resolveAndSanitizeHttpUrl('javascript:void(0)', 'https://blog.example.com/'),
  null,
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
    { youtube_channel_name: 'A', youtube_channel_url: 'https://youtube.com/@a' } as import('../supabase/functions/recipe-import/recipeImportSchema.ts').RecipeImportExtracted,
    'youtube',
  ),
  false,
);
assert.equal(
  recipeMissingCreatorFields(
    { youtube_channel_name: null, youtube_channel_url: null } as import('../supabase/functions/recipe-import/recipeImportSchema.ts').RecipeImportExtracted,
    'youtube',
  ),
  true,
);

const credit = sourceCreditFromImportDto({
  title: 'Pasta',
  servings: 4,
  prep_minutes: null,
  cook_minutes: null,
  ingredients: [],
  steps: [],
  is_recipe: true,
  confidence: 1,
  source_url: 'https://www.youtube.com/watch?v=abc',
  source_type: 'youtube',
  youtube_channel_name: 'Kitchen',
  youtube_channel_url: 'https://www.youtube.com/@kitchen',
});
assert.equal(credit.creatorName, 'Kitchen');
assert.equal(credit.originalUrl, 'https://www.youtube.com/watch?v=abc');

assert.equal(
  youtubeHqDefaultThumbnailUrl('abc123XYZ'),
  'https://i.ytimg.com/vi/abc123XYZ/hqdefault.jpg',
);
assert.equal(
  resolveYouTubeImportImageUrl('https://youtu.be/abc123XYZ', 'https://www.youtube.com/watch?v=abc123XYZ', null),
  clientYoutubeThumb('abc123XYZ'),
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
assert.equal(sanitizeRecipeImageUrl('http://cdn.example.com/dish.jpg'), null);
assert.equal(
  youtubeThumbnailUrlFromWatchUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.includes('hqdefault.jpg'),
  true,
);
const redditCredit = sourceCreditFromImportDto({
  title: 'Soup',
  servings: 4,
  prep_minutes: null,
  cook_minutes: null,
  ingredients: [],
  steps: [],
  is_recipe: true,
  confidence: 1,
  source_url: 'https://www.reddit.com/r/recipes/comments/abc123/soup/',
  source_type: 'reddit',
  social_author_name: 'Recipe from u/chef · r/recipes',
  social_author_url: 'https://www.reddit.com/user/chef',
});
assert.equal(redditCredit.plainCreatorCredit, true);
assert.equal(redditCredit.creatorName, 'Recipe from u/chef · r/recipes');
assert.equal(redditCredit.viewOriginalLabel, 'View original post');

assert.match(kitchenRecipeFeedMetaLine({
  id: 'x',
  name: 'Soup',
  tag: '',
  description: '',
  servings: 4,
  minutes: 20,
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  ingredients: [],
  steps: [],
  isMaster: false,
  createdAt: '',
  sourceType: 'youtube',
  sourceUrl: 'https://www.youtube.com/watch?v=abc',
  sourceChannelName: 'Chef',
} as import('../types/mealprep.ts').Recipe), /20 min · 4 servings · By Chef/);

console.log('OK: recipe-import checks passed');
