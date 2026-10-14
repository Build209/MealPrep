/**
 * Old-app half of supabase/scripts/recipe-import-check.ts: the old app's client code for recipe
 * import, checked against the function where they must agree. The function checks moved to
 * supabase/scripts/ with the functions.
 * Run from mobile/: npm run test:recipe-import
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveYouTubeImportImageUrl } from '../../supabase/functions/recipe-import/recipeImageMeta.ts';
import {
  isAllowedHttpUrlString,
  resolveAndSanitizeHttpUrl,
  sanitizeHttpUrl,
} from '../lib/recipeImport/safeHttpUrl.ts';
import { sourceCreditFromImportDto } from '../lib/recipeImport/sourceCredit.ts';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const redditRecipeBody = `Ingredients:
- 2 cups flour
- 1 cup sugar
- 1/2 cup butter

Instructions:
1. Mix dry ingredients.
2. Bake at 350F for 25 minutes.`;

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

assert.equal(isManualCaptionImportKind('instagram'), true);
assert.equal(classifyImportUrlForClient('https://m.facebook.com/reel/1'), 'facebook');
assert.equal(youtubeVideoIdFromUrl('https://youtu.be/abcd1234efg'), 'abcd1234efg');

assert.equal(
  extractUrlFromClipboardText('Check this https://example.com/recipe) out'),
  'https://example.com/recipe',
);
assert.equal(extractUrlFromClipboardText('no link here'), null);

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
  resolveYouTubeImportImageUrl('https://youtu.be/abc123XYZ', 'https://www.youtube.com/watch?v=abc123XYZ', null),
  clientYoutubeThumb('abc123XYZ'),
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

console.log('OK: recipe-import mobile checks passed');
