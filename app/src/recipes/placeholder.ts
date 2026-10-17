import { colors } from '../theme/tokens';

/**
 * Illustrated stand-in for a recipe with no photo. Pure (no React) so it can be unit tested:
 * `placeholderFor(tags, title)` picks one of a dozen-odd food categories from the recipe's
 * tag (library_recipes.tags[0]) and, failing that, its title. Icons are MaterialCommunityIcons
 * glyphs from the icon set the app already ships; tints reuse existing colour tokens.
 */
export type PlaceholderCategory =
  | 'drink'
  | 'sauce'
  | 'soup'
  | 'salad'
  | 'dessert'
  | 'bread'
  | 'pasta'
  | 'rice'
  | 'seafood'
  | 'meat'
  | 'egg'
  | 'beans'
  | 'vegetable'
  | 'generic';

export type Placeholder = { category: PlaceholderCategory; glyph: string; tint: string };

const TILE: Record<PlaceholderCategory, string> = {
  drink: colors.successLight,
  sauce: colors.tomatoLight,
  soup: colors.warningLight,
  salad: colors.successLight,
  dessert: colors.tomatoLight,
  bread: colors.warningLight,
  pasta: colors.warningLight,
  rice: colors.sand,
  seafood: colors.sand,
  meat: colors.tomatoLight,
  egg: colors.warningLight,
  beans: colors.warningLight,
  vegetable: colors.successLight,
  generic: colors.sand,
};

const GLYPH: Record<PlaceholderCategory, string> = {
  drink: 'cup',
  sauce: 'bowl-mix',
  soup: 'pot-steam',
  salad: 'leaf',
  dessert: 'cupcake',
  bread: 'bread-slice',
  pasta: 'pasta',
  rice: 'rice',
  seafood: 'fish',
  meat: 'food-drumstick',
  egg: 'egg-fried',
  beans: 'seed',
  vegetable: 'carrot',
  generic: 'silverware-fork-knife',
};

/** Checked in this order: the first category whose words appear wins (so "chicken soup" is soup, not meat). */
const RULES: ReadonlyArray<readonly [PlaceholderCategory, RegExp]> = [
  ['drink', /\b(smoothies?|drinks?|beverages?|juices?|lemonades?|cocktails?|tea|coffee|shakes?|milkshakes?|punch|cider|latte|lassi|cocoa|beers?|wines?|sangria|eggnog)\b/],
  ['soup', /\b(soups?|stews?|chowders?|broths?|bisques?|gumbo|chili|chilli|ramen|pho|minestrone|goulash|consomme|stocks?)\b/],
  ['salad', /\b(salads?|slaws?|coleslaw|tabbouleh|salsa)\b/],
  ['sauce', /\b(sauces?|dips?|dressings?|gravy|gravies|marinades?|spreads?|hummus|pesto|guacamole|relish|chutneys?|syrups?|jams?|jellies|condiments?|mayonnaise|vinaigrettes?|glazes?|rubs?|seasonings?|spices?|butters?)\b/],
  ['dessert', /\b(desserts?|sweets?|cakes?|cupcakes?|cookies?|brownies?|pies?|tarts?|puddings?|custards?|ice\s?cream|candy|candies|fudge|truffles?|mousse|cobblers?|crisps?|crumbles?|cheesecakes?|pastr(?:y|ies)|donuts?|doughnuts?|chocolates?|sorbets?|gelato|pralines?|macarons?|flans?|baklava|biscotti|candied|frosting|icing|marshmallows?|bars?)\b/],
  ['bread', /\b(breads?|baking|baked|rolls?|buns?|biscuits?|muffins?|scones?|bagels?|pizzas?|focaccia|loaf|loaves|pretzels?|crackers?|flatbreads?|naan|pita|tortillas?|pancakes?|waffles?|crepes?|toast|sandwich(?:es)?|doughs?|cornbread|croissants?|baguettes?|breadsticks?|calzones?)\b/],
  ['pasta', /\b(pastas?|noodles?|spaghetti|macaroni|lasagn[ae]|fettuccine|linguine|penne|ravioli|gnocchi|tortellini|udon|lo\s?mein|pad\s?thai|vermicelli|orzo|manicotti|rigatoni|dumplings?)\b/],
  ['rice', /\b(rice|risotto|pilaf|pilau|paella|biryani|grains?|quinoa|couscous|barley|oats?|oatmeal|porridge|polenta|bulgur|millet|congee|jambalaya|cereals?|granola|farro)\b/],
  ['seafood', /\b(fish|seafood|salmon|tuna|shrimps?|prawns?|crabs?|lobsters?|cod|tilapia|trout|halibut|mussels?|clams?|oysters?|scallops?|squid|calamari|sardines?|anchov(?:y|ies)|catfish|snapper|mackerel|haddock|bass|sushi|ceviche)\b/],
  ['meat', /\b(meats?|chicken|poultry|turkey|beef|steaks?|pork|ham|bacon|sausages?|lamb|veal|duck|ribs?|roasts?|meatballs?|meatloaf|burgers?|hamburgers?|hot\s?dogs?|brisket|kebabs?|wings?|venison|game|jerky|barbecue|bbq|grill(?:ed)?|carnitas|schnitzel)\b/],
  ['egg', /\b(eggs?|breakfasts?|omelet(?:te)?s?|frittata|quiche|scrambled|brunch|hash\s?browns?|benedict|shakshuka|souffle)\b/],
  ['beans', /\b(beans?|legumes?|lentils?|chickpeas?|peas?|dal|dahl|tofu|tempeh|falafel|soy|edamame|pulses?|refried)\b/],
  ['vegetable', /\b(vegetables?|veg|veggies?|vegetarian|vegan|potato(?:es)?|carrots?|broccoli|cauliflower|spinach|kale|cabbage|zucchini|squash|pumpkin|corn|mushrooms?|onions?|tomato(?:es)?|peppers?|eggplant|aubergine|asparagus|celery|beets?|turnips?|yams?|greens|cucumbers?|artichokes?|leeks?|fruits?|apples?|berr(?:y|ies)|bananas?|lemons?|oranges?|mango(?:es)?|avocados?|stir\s?fry|side\s?dish(?:es)?)\b/],
];

function categoryOf(text: string): PlaceholderCategory | null {
  const s = text.toLowerCase().replace(/[_\-/]+/g, ' ');
  if (!s.trim()) return null;
  for (const [category, pattern] of RULES) if (pattern.test(s)) return category;
  return null;
}

/** Tag first (the library's tags[0] is the dish type), then the title, else the generic plate-and-cutlery tile. */
export function placeholderFor(tags: string | readonly string[] | null | undefined, title?: string | null): Placeholder {
  const list: readonly unknown[] = typeof tags === 'string' ? [tags] : Array.isArray(tags) ? tags : [];
  let category: PlaceholderCategory | null = null;
  for (const tag of list) {
    category = typeof tag === 'string' ? categoryOf(tag) : null;
    if (category) break;
  }
  category ??= categoryOf(title ?? '') ?? 'generic';
  return { category, glyph: GLYPH[category], tint: TILE[category] };
}
