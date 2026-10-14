/** Drop non-recipe YouTube uploads (vlogs, mukbang, Q&A, hauls, etc.). */

/** Legacy broad non-recipe signals — title only (descriptions often contain merch/podcast links). */
const NON_RECIPE_TITLE = new RegExp(
  '\\b(vlog|mukbang|prank|q\\s*&\\s*a|qa|haul|unboxing|giveaway|merch|podcast|react|reaction|shorts compilation|behind the scenes|bts|what i eat in a day|wieiad|grocery haul|room tour|day in my life|asmr eating)\\b',
  'i',
);

/** Hard excludes — title only (never description boilerplate). */
const EXCLUDE_TITLE = new RegExp(
  '\\b(' +
    'i tried|every country|\\$\\s*1\\s*vs|ranked|ranks|taste test|mukbang|' +
    'review|blender|knives|burner|protein bars|equipment|' +
    'taking a break|retirement|feedback|announcement|' +
    'full episode|recap|beat bobby flay|chopped|restaurant impossible|diners, drive-ins|' +
    '\\bhacks\\b|challenge|mystery|last meals|gear heads|kitchen tools|gadget|' +
    'levels of|tasters|\\brate\\b|explains|what does|how to pick|answering|' +
    'questions|takes on|controversial' +
  ')\\b',
  'i',
);

/** Tests, viral experiments, “worth it?” videos. */
const EXCLUDE_TESTS_TITLE = new RegExp(
  '\\b(' +
    'i tested|tested|testing|let\'?s test|recipe test|i had to try|trying viral|' +
    'high hopes this works|is this a dumb|actually work|worth (it|making)|still good|' +
    'even food|did i improve|dry[- ]?ag(?:e|ed|ing)' +
  ')\\b|' +
  '^is\\b.*\\b(good|worth)\\b.*\\?|' +
  '^can an? .+\\b(make|cook)\\b',
  'i',
);

/** Store reviews, rankings, taste tests. */
const EXCLUDE_REVIEWS_TITLE = new RegExp(
  '\\b(' +
    'rated|rating|reviews?|brutally honest|tier list|lidl|costco|trader joe\'?s|' +
    'häagen-dazs|haagen-dazs|hot ones|kid taste tests?|store-bought|meat experts try' +
  ')\\b|' +
  '\\bstore-bought\\b.{0,40}\\bbest\\b|\\bbest store-bought\\b',
  'i',
);

/** Stunts, exotic food, battles. */
const EXCLUDE_STUNTS_TITLE = new RegExp(
  '\\b(' +
    'exotic|would you eat|last meal|battle|bake off|showdown|who can cook|faster than' +
  ')\\b|' +
  '\\bi (ate|bought|cooked|paid|aged|soaked|drowned)\\b.+\\bevery\\b|' +
  '\\bevery (exotic|way to cook|youtuber)\\b|' +
  '\\$[\\d,]{3,}\\s*(cake|steak)\\b',
  'i',
);

/** Storytime, travel vlogs, long-form non-recipe. */
const EXCLUDE_STORYTIME_TITLE = new RegExp(
  '#?storytime|(?:^|\\s)cooking stories\\b|\\bfull movie\\b|\\b\\d+ hours\\b|' +
  '\\bmy hometown\\b|inside the mind|\\bhope air\\b|\\bwith (locals|bedouins)\\b',
  'i',
);

/** Entertainment / collabs — not a cook-along recipe. */
const EXCLUDE_ENTERTAINMENT_TITLE = new RegExp(
  '\\b(' +
    'wwe|jackass|guitar hero|pizza avengers|gta \\d|krogerpartner|football & ice cream' +
  ')\\b|' +
  'breakfast in bed\\s+(?:with|ft)\\b|i shop, you cook|' +
  '\\bw/@\\w+\\b|\\bcooking (?:for|with) .{0,40}(?:pogba|beerus|rush|segura)\\b|' +
  '\\bi cook for a baby\\b|literally no one asked',
  'i',
);

/** Oddballs: progression Shorts, “is this good?” taste checks, spin-the-wheel dinners. */
const EXCLUDE_MISC_NON_RECIPE_TITLE = new RegExp(
  '\\bnon-negotiable\\b(?! when)|\\bbetter the .+ better the\\b|\\brecipe good\\?\\s*$|' +
  '\\bbetter than jerky\\b|\\bi challenged every\\b|snow[- ]aged|\\bchooses my dinner\\b|' +
  '\\bbest school lunch\\b|\\bsteak progression\\b|\\bice cream and chicken\\b|' +
  '\\bi ate this .+ from\\b|\\bmeat spin\\b',
  'i',
);

/** Technique tips and listicles without a single dish recipe. */
const EXCLUDE_TIPS_TECHNIQUE_TITLE = new RegExp(
  '^how to(?: properly)? (soften|thicken|shape|peel|cut|reheat|store|pick|know)\\b|' +
  '^how (?:much|to make your)\\b|^use this tip\\b|^i put\\b.+\\b(?:in the air fryer|air fryer)\\b|' +
  '^the (?:sheet pan )?secret to\\b|^the (easiest|better|best) way to (?:peel|cut|thicken|serve|break up|shape|season)\\b|' +
  '^(?:why (?:does|you should|your)|should you|what(?:\'s| is| are)|stop (?:flipping|making))\\b|' +
  '\\b\\d+ (?:techniques|rules|kitchen skills|essential cooking skills|ways to make cooking easier|pizza rules)\\b|' +
  '(?:doing|cooking|marinating) .+ wrong|get this wrong|' +
  'everything (?:you need to know|i learned)|\\b101\\b|' +
  '\\bhack\\b.+\\b(?:every cook|you should know)\\b|\\bevery cook should know\\b|' +
  '\\bbeen .+ wrong\\b|\\bfaster way to\\b|\\bthis tip\\b|\\btip to\\b|\\bnon-negotiable when\\b|' +
  '\\btrick no one\\b|\\bscrap most people\\b|\\bmore flavorful\\b|\\btastes expensive with this\\b|' +
  '\\badd flavor without\\b|\\bsoaking your cake\\b|\\bshaping dough for\\b|\\bpacks \\d+ grams of protein\\b|' +
  '\\bwho eats all the food\\b|#cookingtips|\\bx fish tales\\b|\\bomelet breakage\\b|\\bshould you stir\\b|' +
  '\\bis this truly the best\\b|\\bdoes not impress\\b|\\bfor the first time\\b',
  'i',
);

const MEAL_PREP_GUIDE_KEEP = /\bmeal prep guide\b/i;

/** Food science Q&A — not a recipe walkthrough. */
const EXCLUDE_FOOD_INFO_TITLE = new RegExp(
  '\\b(difference between|types of|pink juices|smell funny|safely cooked|80/20)\\b',
  'i',
);

/** Gear ads and product comparisons. */
const EXCLUDE_GEAR_TITLE = new RegExp(
  '\\b(' +
    'ice cream maker|scooper|cake pan|coffee machine|silicone bags|meat thermometer|' +
    'stainless steel pan|toxic kitchen items|pizza ovens?' +
  ')\\b|air fryer cooking has changed',
  'i',
);

/** Channel promos and series trailers. */
const EXCLUDE_PROMO_TITLE = new RegExp(
  '\\b(changes are coming|signed|preview|find any recipe|cook with me every|series)\\b',
  'i',
);

function isReactionDuetTitle(title: string): boolean {
  if (!/^@\w+/i.test(title.trim())) return false;
  return /#jokes?|messed it up|not what i expected/i.test(title);
}

/** Subscriber / milestone videos — title only (descriptions often mention subscribers). */
const EXCLUDE_CHANNEL_NEWS_TITLE = new RegExp(
  '\\b(subscribers|thank you to our \\d|million subscribers)\\b',
  'i',
);

const EXCLUDE_VS = /\s+vs\.?\s+/i;

const EXCLUDE_LIVE_PREFIX = /^LIVE:/i;

const EXCLUDE_TOOLS_IN_TITLE = /\b(tools|kitchen tools)\b/i;

const GEAR_BEST_UNDER = /\bbest\b.{0,40}\bunder\s*\$/i;

/** Meal-focused grocery / budget challenges (keep) override generic "challenge" noise. */
const MEAL_CHALLENGE_KEEP = new RegExp(
  '\\b(' +
    '(\\d+\\s+)?cheap\\s+dinners?|budget\\s+meals?|' +
    'grocery\\s+challenge|\\$\\d+\\s+grocery\\s+challenge' +
  ').{0,50}\\b(dinners?|meals?|recipes?|week)\\b|\\b(dinners?|meals?|recipes?)\\b.{0,50}\\b(grocery\\s+challenge|\\$\\d+\\s+grocery)\\b',
  'i',
);

const TITLE_RECIPE_SIGNAL = new RegExp(
  '\\b(' +
    'recipe|recipes|cook|cooking|bake|baking|dinner|dinners|lunch|breakfast|brunch|meal|meals|' +
    'meal prep|air fryer|instant pot|slow cooker|soup|stew|curry|pasta|chicken|beef|steak|salmon|' +
    'tacos|salad|dessert|cookies|cake|how to make|sheet pan|one[- ]pan|one[- ]pot|shakshuka|rag[uù]|' +
    'bolognese|tenders|orange chicken|budget|turkey|pork|vegetables|' +
    'burger|pizza|rice|bread|potato|potatoes|shrimp|ramen|sandwich|chili|casserole|fish|poach|ice cream|' +
    'fed my family|\\$\\d+\\s+meal|croque|lasagna|meatloaf|meat pie|omelet|omelette|aglio' +
  ')\\b',
  'i',
);

const INGREDIENTS_HEADING = /\bingredients\b/i;

const MEASURED_QUANTITY = new RegExp(
  '\\b\\d+(?:\\.\\d+)?\\s*(?:' +
    'cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|' +
    'oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|ml|liter|litre|liters|litres' +
  ')\\b',
  'i',
);

const BUDGET_KEYWORDS = new RegExp(
  '\\b(budget|cheap|affordable|frugal|dollar|under \\$|meal prep|pantry|leftovers|grocery challenge)\\b',
  'i',
);

const QUICK_TITLE = new RegExp(
  '\\b(' +
    '15[- ]?minute|20[- ]?minute|30[- ]?minute|quick|easy weeknight|one pan|one[- ]pan|one[- ]pot|' +
    'sheet pan|air fryer|5[- ]ingredient|five[- ]ingredient|lazy' +
  ')\\b',
  'i',
);

export type RecipeVideoFilterOptions = {
  isShort?: boolean;
};

export function stripUrlsAndLinkLines(text: string): string {
  const withoutUrls = text.replace(/https?:\/\/[^\s]+/gi, ' ');
  return withoutUrls
    .split('\n')
    .filter((line) => !/^\s*(?:link|links|shop|merch|subscribe|follow)\b/i.test(line.trim()))
    .join('\n')
    .trim();
}

function matchesGuideExclude(title: string): boolean {
  if (MEAL_PREP_GUIDE_KEEP.test(title)) return false;
  return /\bguide\b/i.test(title);
}

function isShortWithoutDish(title: string, descriptionSnippet: string): boolean {
  const titleText = title.trim();
  if (!titleText) return true;
  if (TITLE_RECIPE_SIGNAL.test(titleText)) return false;
  const descHead = stripUrlsAndLinkLines(descriptionSnippet).slice(0, 200);
  if (hasIngredientOrMeasurementSignal(descHead)) return false;
  return true;
}

export function hasIngredientOrMeasurementSignal(description: string): boolean {
  const text = stripUrlsAndLinkLines(description).trim();
  if (!text) return false;
  if (INGREDIENTS_HEADING.test(text)) return true;
  return MEASURED_QUANTITY.test(text);
}

export function hasTitleRecipeSignal(title: string): boolean {
  return TITLE_RECIPE_SIGNAL.test(title.trim());
}

export function isExcludedNonRecipeContent(
  title: string,
  descriptionSnippet: string,
  options?: RecipeVideoFilterOptions,
): boolean {
  const titleText = title.trim();
  const description = stripUrlsAndLinkLines(descriptionSnippet).trim();
  if (!titleText && !description) return true;

  if (MEAL_CHALLENGE_KEEP.test(titleText)) return false;

  if (NON_RECIPE_TITLE.test(titleText)) return true;
  if (EXCLUDE_CHANNEL_NEWS_TITLE.test(titleText)) return true;
  if (EXCLUDE_LIVE_PREFIX.test(titleText)) return true;
  if (EXCLUDE_VS.test(titleText)) return true;
  if (EXCLUDE_TOOLS_IN_TITLE.test(titleText)) return true;
  if (EXCLUDE_TITLE.test(titleText)) return true;
  if (GEAR_BEST_UNDER.test(titleText)) return true;
  if (EXCLUDE_TESTS_TITLE.test(titleText)) return true;
  if (EXCLUDE_REVIEWS_TITLE.test(titleText)) return true;
  if (EXCLUDE_STUNTS_TITLE.test(titleText)) return true;
  if (EXCLUDE_STORYTIME_TITLE.test(titleText)) return true;
  if (EXCLUDE_ENTERTAINMENT_TITLE.test(titleText)) return true;
  if (EXCLUDE_MISC_NON_RECIPE_TITLE.test(titleText)) return true;
  if (EXCLUDE_TIPS_TECHNIQUE_TITLE.test(titleText)) return true;
  if (matchesGuideExclude(titleText)) return true;
  if (EXCLUDE_FOOD_INFO_TITLE.test(titleText)) return true;
  if (EXCLUDE_GEAR_TITLE.test(titleText)) return true;
  if (EXCLUDE_PROMO_TITLE.test(titleText)) return true;
  if (isReactionDuetTitle(titleText)) return true;

  if (options?.isShort && isShortWithoutDish(titleText, description)) return true;

  return false;
}

export function isRecipeLikeVideo(
  title: string,
  descriptionSnippet: string,
  options?: RecipeVideoFilterOptions,
): boolean {
  const titleText = title.trim();
  const description = stripUrlsAndLinkLines(descriptionSnippet).trim();
  if (!titleText && !description) return false;

  if (isExcludedNonRecipeContent(titleText, description, options)) return false;
  if (hasTitleRecipeSignal(titleText)) return true;
  if (hasIngredientOrMeasurementSignal(description)) return true;
  return false;
}

/** Hide hack/listicle and other non-recipe rows from mixed feeds (e.g. popular). */
export function isLowQualityFeedVideo(
  title: string,
  descriptionSnippet: string,
  options?: RecipeVideoFilterOptions,
): boolean {
  return isExcludedNonRecipeContent(title, descriptionSnippet, options);
}

export function matchesBudgetFeed(title: string, descriptionSnippet: string): boolean {
  return BUDGET_KEYWORDS.test(`${title} ${stripUrlsAndLinkLines(descriptionSnippet)}`);
}

export function matchesQuickFeed(
  title: string,
  _descriptionSnippet: string,
  _durationSeconds: number | null,
  _isShort: boolean,
): boolean {
  return QUICK_TITLE.test(title.trim());
}

export function parseIsoDurationSeconds(iso: string | undefined | null): number | null {
  if (!iso || !iso.startsWith('PT')) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = Number.parseInt(match[1] ?? '0', 10);
  const minutes = Number.parseInt(match[2] ?? '0', 10);
  const seconds = Number.parseInt(match[3] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
