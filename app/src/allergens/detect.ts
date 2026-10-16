/**
 * Allergen detection from ingredient names. Pure; tests/allergens-detect.test.ts.
 *
 * This is a conservative estimate from names only, NOT a safety check. It never sees labels, brands
 * or "may contain" statements (out of scope). Rules of thumb:
 *  - Names go through the app's ingredient normaliser first, then are split into words.
 *    Words match whole (plurals folded: eggs/egg, anchovies/anchovy), never as substrings, so
 *    eggplant, nutmeg, butternut, buttercup and doughnut do not match egg, nut, butter, etc.
 *  - Plant "milks" and "butters" do not count as milk: almond milk is tree nuts, oat milk is nothing,
 *    peanut butter is peanuts, coconut milk and coconut cream are nothing.
 *  - Coconut is NOT treated as a tree nut here. Water chestnut and nutmeg are not nuts either.
 *  - Pine nuts ARE treated as tree nuts (older FDA lists include them; flagging errs on caution).
 *  - "Mixed nuts" flags both tree nuts and peanuts. A bare "nuts"/"nut" flags tree nuts.
 *  - Shellfish covers crustaceans and molluscs (squid, octopus, oyster, clam...), more than the FDA's
 *    crustacean-only rule, again on the side of caution. Oyster mushroom and crab apple are excluded.
 *  - Wheat: wheat, flour, bread, pasta and the wheat grains (couscous, semolina, bulgur, farro, spelt),
 *    seitan, noodles. Barley and rye are gluten but not wheat, so they are not matched. Flour of
 *    another grain (rice, almond, coconut, corn, oat, chickpea...) is not wheat. Soy sauce is soy only
 *    (many soy sauces also hold wheat: check labels).
 *  - "<thing> free" (dairy free, gluten free, nut free...) and "vegan" cancel the matching allergen on
 *    that line only.
 *  - Worcestershire sauce flags fish (usually made with anchovies). Pesto is not flagged.
 */
import { normalizeIngredientName } from '../kitchen/ingredientNormalize';
import { ALLERGEN_KEYS, type AllergenKey } from './types';

type Rule = {
  /** Words or phrases (space separated) that trigger the allergen. Singular forms. */
  words: readonly string[];
  /** A trigger does not count when one of these words is in the two words before it. */
  notAfter?: readonly string[];
  /** A trigger does not count when this word or phrase directly follows it. */
  notBefore?: readonly string[];
};

/** Words that turn milk/butter/cream/cheese/yogurt into a plant product. */
const PLANT = ['almond', 'oat', 'coconut', 'soy', 'soya', 'rice', 'cashew', 'hemp', 'pea', 'macadamia', 'hazelnut', 'flax', 'peanut', 'sunflower', 'cocoa', 'cacao', 'shea', 'apple', 'nut', 'plant', 'chia', 'walnut', 'pistachio', 'pecan'];
/** Flours that are not wheat. */
const OTHER_FLOURS = ['rice', 'almond', 'coconut', 'corn', 'oat', 'chickpea', 'tapioca', 'potato', 'cassava', 'buckwheat', 'quinoa', 'sorghum', 'millet', 'teff', 'arrowroot', 'gram', 'besan', 'lentil', 'banana', 'cashew', 'hazelnut', 'soy', 'amaranth', 'masa', 'peanut'];

const RULES: Record<AllergenKey, readonly Rule[]> = {
  milk: [
    { words: ['milk', 'butter', 'cream', 'cheese', 'yogurt', 'yoghurt'], notAfter: PLANT, notBefore: ['lettuce', 'bean', 'thistle', 'of tartar', 'of coconut'] },
    {
      words: ['whey', 'casein', 'caseinate', 'ghee', 'buttermilk', 'kefir', 'custard', 'half and half', 'creme fraiche', 'ricotta', 'mascarpone', 'mozzarella', 'cheddar', 'parmesan', 'parmigiano', 'feta', 'gouda', 'brie', 'paneer', 'gruyere', 'halloumi', 'eggnog', 'lactose'],
    },
  ],
  eggs: [
    { words: ['egg', 'mayonnaise', 'mayo', 'meringue', 'aioli', 'albumen', 'eggnog'], notAfter: ['flax', 'chia'], notBefore: ['replacer', 'substitute'] },
  ],
  fish: [
    {
      words: ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'sardine', 'mackerel', 'tilapia', 'trout', 'halibut', 'haddock', 'snapper', 'herring', 'swordfish', 'mahi', 'pollock', 'catfish', 'bass', 'flounder', 'sole', 'perch', 'carp', 'eel', 'worcestershire', 'bonito', 'whitefish', 'branzino', 'grouper'],
    },
  ],
  shellfish: [
    {
      words: ['shrimp', 'prawn', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'crawfish', 'crayfish', 'langoustine', 'squid', 'calamari', 'octopus', 'abalone', 'whelk', 'krill'],
      notBefore: ['mushroom', 'apple', 'squash'],
    },
  ],
  'tree-nuts': [
    {
      words: ['almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'pine nut', 'pignoli', 'filbert', 'marzipan', 'nutella', 'nut', 'mixed nut'],
    },
    { words: ['chestnut'], notAfter: ['water'] },
  ],
  peanuts: [{ words: ['peanut', 'groundnut', 'mixed nut'] }],
  wheat: [
    { words: ['flour'], notAfter: OTHER_FLOURS },
    { words: ['noodle'], notAfter: ['rice', 'glass', 'cellophane', 'shirataki', 'konjac', 'mung', 'bean'] },
    { words: ['pasta'], notAfter: ['rice', 'chickpea', 'lentil', 'bean', 'corn', 'quinoa'] },
    {
      words: ['wheat', 'bread', 'breadcrumb', 'panko', 'spaghetti', 'macaroni', 'penne', 'fettuccine', 'linguine', 'lasagna', 'lasagne', 'orzo', 'ravioli', 'tortellini', 'couscous', 'semolina', 'bulgur', 'farro', 'spelt', 'seitan', 'pita', 'baguette', 'durum', 'kamut', 'farina', 'crouton'],
    },
  ],
  soy: [{ words: ['soy', 'soya', 'soybean', 'tofu', 'edamame', 'miso', 'tempeh', 'tamari'] }],
  sesame: [{ words: ['sesame', 'tahini'] }],
};

/** What "<x> free" on a line cancels. */
const FREE_OF: Record<string, readonly AllergenKey[]> = {
  dairy: ['milk'],
  lactose: ['milk'],
  milk: ['milk'],
  gluten: ['wheat'],
  wheat: ['wheat'],
  egg: ['eggs'],
  nut: ['tree-nuts', 'peanuts'],
  peanut: ['peanuts'],
  soy: ['soy'],
  sesame: ['sesame'],
  fish: ['fish'],
  shellfish: ['shellfish'],
};

/** "vegan" on a line cancels these. */
const VEGAN_CANCELS: readonly AllergenKey[] = ['milk', 'eggs', 'fish', 'shellfish'];

const KNOWN_WORDS = new Set<string>([...PLANT, ...OTHER_FLOURS]);
for (const key of ALLERGEN_KEYS) {
  for (const rule of RULES[key]) {
    for (const w of [...rule.words, ...(rule.notAfter ?? []), ...(rule.notBefore ?? [])]) {
      for (const part of w.split(' ')) KNOWN_WORDS.add(part);
    }
  }
}

/** Plural to singular, but only when the result is a word the rules know (so "peas" stays "peas"). */
function foldWord(word: string): string {
  if (KNOWN_WORDS.has(word)) return word;
  const forms: string[] = [];
  if (word.endsWith('ies') && word.length > 4) forms.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es') && word.length > 3) forms.push(word.slice(0, -2));
  if (word.endsWith('s') && word.length > 3) forms.push(word.slice(0, -1));
  return forms.find((f) => KNOWN_WORDS.has(f)) ?? word;
}

/** Lower case, accents off, words only, plurals folded. */
function wordsOf(name: string): string[] {
  const normalized = normalizeIngredientName(name) || name;
  const plain = normalized.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return plain
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map(foldWord);
}

function phraseAt(words: readonly string[], i: number, phrase: readonly string[]): boolean {
  return phrase.every((p, j) => words[i + j] === p);
}

function ruleMatches(rule: Rule, words: readonly string[]): boolean {
  for (const trigger of rule.words) {
    const phrase = trigger.split(' ');
    for (let i = 0; i + phrase.length <= words.length; i++) {
      if (!phraseAt(words, i, phrase)) continue;
      const before = words.slice(Math.max(0, i - 2), i);
      const blockedBefore = (rule.notAfter ?? []).some((q) => before.includes(q));
      const blockedAfter = (rule.notBefore ?? []).some((q) => phraseAt(words, i + phrase.length, q.split(' ')));
      if (!blockedBefore && !blockedAfter) return true;
    }
  }
  return false;
}

const NAME_CACHE = new Map<string, AllergenKey[]>();

function detectOne(name: string): AllergenKey[] {
  const cached = NAME_CACHE.get(name);
  if (cached) return cached;
  const words = wordsOf(name);
  const found = new Set<AllergenKey>();
  for (const key of ALLERGEN_KEYS) {
    if (RULES[key].some((rule) => ruleMatches(rule, words))) found.add(key);
  }
  for (let i = 1; i < words.length; i++) {
    if (words[i] === 'free') for (const k of FREE_OF[words[i - 1]!] ?? []) found.delete(k);
  }
  if (words.includes('vegan')) for (const k of VEGAN_CANCELS) found.delete(k);
  const result = ALLERGEN_KEYS.filter((k) => found.has(k));
  if (NAME_CACHE.size > 4000) NAME_CACHE.clear();
  NAME_CACHE.set(name, result);
  return result;
}

/** Allergens suggested by these ingredient names, in ALLERGEN_KEYS order, each once. */
export function detectAllergens(ingredientNames: readonly string[]): AllergenKey[] {
  const found = new Set<AllergenKey>();
  for (const name of ingredientNames) for (const a of detectOne(name)) found.add(a);
  return ALLERGEN_KEYS.filter((k) => found.has(k));
}

/** The user's allergens that this recipe's ingredient names match (ALLERGEN_KEYS order). */
export function recipeAllergenStatus(
  recipe: { ingredients: readonly { name: string }[] },
  userAllergens: readonly AllergenKey[],
): AllergenKey[] {
  if (userAllergens.length === 0) return [];
  const mine = new Set(userAllergens);
  return detectAllergens(recipe.ingredients.map((i) => i.name)).filter((a) => mine.has(a));
}
