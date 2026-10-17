/**
 * Ingredient name cleanup, the core half: lower-casing, brand and quantity stripping,
 * plurals, synonym lookup tables. Copied from the old app
 * (mobile/lib/recipeMatch/ingredientNormalize.ts), split in two to stay under 400 lines;
 * the public functions are in ingredientNormalize.ts.
 */
import {
  PANTRY_SCAN_PHRASE_SYNONYMS,
  PANTRY_SCAN_STRIP_BRANDS,
} from './scanNormalizeConfig';
import {
  INGREDIENT_CATEGORY_GROUPS,
  INGREDIENT_CUT_OR_FORM_MODIFIERS,
  INGREDIENT_SYNONYMS,
  INGREDIENT_LEADING_PREP_WORDS,
  INGREDIENT_STRIP_TOKENS,
} from './matchingConfig';

export const CUT_MODIFIERS = new Set<string>(INGREDIENT_CUT_OR_FORM_MODIFIERS);

/** Variety words that refine a generic ingredient (jasmine rice) but are not a different product. */
export const VARIETY_MODIFIERS = new Set([
  'jasmine',
  'basmati',
  'brown',
  'wild',
  'cauliflower',
  'white',
  'yellow',
  'red',
  'black',
  'green',
]);

export const STRIP_TOKENS = new Set<string>(INGREDIENT_STRIP_TOKENS);
const LEADING_PREP_WORDS = new Set<string>(INGREDIENT_LEADING_PREP_WORDS);
/** Two-word lines like "minced garlic" — not "diced tomatoes" (product). */
const LEADING_PREP_TWO_WORD = new Set(['minced', 'chopped', 'crushed', 'grated', 'melted', 'softened']);

const QUANTITY_PATTERNS: RegExp[] = [
  /\b\d+(\.\d+)?\s*(%|percent)\b/gi,
  /\b\d+(\.\d+)?%/gi,
  /\b\d+(\.\d+)?\s*(oz|lb|lbs|g|kg|ml|l|ct|count|pk|pack|gal|gallon)\b/gi,
  /\b\d+(\.\d+)?\s*[-/]\s*\d+(\.\d+)?\b/g,
  /\b\d+(\.\d+)?\b/g,
];


const PANTRY_BRANDS_SORTED = [...PANTRY_SCAN_STRIP_BRANDS].sort((a, b) => b.length - a.length);
const PANTRY_PHRASE_KEYS_SORTED = Object.keys(PANTRY_SCAN_PHRASE_SYNONYMS).sort(
  (a, b) => b.length - a.length,
);

const spaced = (text: string) => text.replace(/\s+/g, '\\s+');

/** Built once: these patterns used to be rebuilt for every ingredient name. */
const BRAND_PATTERNS = PANTRY_BRANDS_SORTED.map((brand) => new RegExp(`\\b${spaced(brand)}\\b`, 'gi'));

function stripPantryScanBrands(text: string): string {
  let out = text;
  for (const pattern of BRAND_PATTERNS) out = out.replace(pattern, ' ');
  return out;
}

const PANTRY_PHRASE_WHOLE_NAME_ONLY = new Set(['oatmeal', 'syrup']);

type PhraseRule = {
  key: string;
  replacement: string;
  /** Presence test (no `g` flag, so no lastIndex state), and the replacing pattern. */
  has: RegExp;
  replace: RegExp;
  replacementHas: RegExp | null;
  whole: RegExp | null;
};

const PHRASE_RULES: PhraseRule[] = PANTRY_PHRASE_KEYS_SORTED.map((key) => {
  const replacement = PANTRY_SCAN_PHRASE_SYNONYMS[key] ?? key;
  return {
    key,
    replacement,
    has: new RegExp(`\\b${spaced(key)}\\b`, 'i'),
    replace: new RegExp(`\\b${spaced(key)}\\b`, 'gi'),
    replacementHas: replacement.toLowerCase().startsWith(key.toLowerCase()) ? new RegExp(`\\b${spaced(replacement)}\\b`, 'i') : null,
    whole: PANTRY_PHRASE_WHOLE_NAME_ONLY.has(key) ? new RegExp(`^${spaced(key)}$`, 'i') : null,
  };
});

function applyPantryScanPhraseSynonyms(text: string): string {
  let out = text;
  for (const rule of PHRASE_RULES) {
    const { key } = rule;
    if (!rule.has.test(out)) continue;
    if (rule.replacementHas && rule.replacementHas.test(out)) continue;
    if (key === 'syrup' && /\b(?:pancake|maple|corn|chocolate|waffle|breakfast)\s+syrup\b/i.test(out)) {
      continue;
    }
    if (key === 'oatmeal' && /\binstant\s+oatmeal\b/i.test(out)) {
      continue;
    }
    if (rule.whole && !rule.whole.test(out.trim())) continue;
    out = out.replace(rule.replace, rule.replacement);
  }
  return out;
}

function stripParentheticalNotes(text: string): string {
  let out = text;
  for (let i = 0; i < 6; i += 1) {
    const next = out
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{[^}]*\}/g, ' ');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Drop trailing prep clauses after a comma when they are only strip/prep tokens. */
function stripTrailingCommaClause(text: string): string {
  const comma = text.indexOf(',');
  if (comma < 0) return text;
  const head = text.slice(0, comma).trim();
  const tail = text.slice(comma + 1).trim();
  if (!head || !tail) return text;
  const tailTokens = tail
    .split(/\s+/)
    .map((t) => t.replace(/[^ \p{L}\p{N}-]/gu, ''))
    .filter(Boolean);
  if (tailTokens.length === 0) return head;
  const prepOnly = tailTokens.every(
    (t) =>
      STRIP_TOKENS.has(t) ||
      LEADING_PREP_WORDS.has(t) ||
      CUT_MODIFIERS.has(t) ||
      VARIETY_MODIFIERS.has(t) ||
      t === 'to',
  );
  return prepOnly ? head : text;
}

export function normalizeIngredientNameCore(value: string): string {
  let text = value
    .normalize('NFC')
    .toLowerCase()
    .replace(/\[demo sample\]/gi, '')
    .replace(/&/g, ' and ')
    .replace(/(\p{L})['’]s\b/giu, '$1 ')
    .replace(/['’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  text = stripParentheticalNotes(text);
  text = stripTrailingCommaClause(text);

  text = stripPantryScanBrands(text);
  text = text.replace(/[^ \p{L}\p{N}%./-]/gu, ' ');

  for (const pattern of QUANTITY_PATTERNS) {
    text = text.replace(pattern, ' ');
  }

  text = applyPantryScanPhraseSynonyms(text);
  text = text.replace(/(?:^|\s)s(?=\s|$)/g, ' ');

  return text.replace(/\s+/g, ' ').trim();
}

const PLURAL_KEEP_TOKENS = new Set(['beans', 'gras']);

/** Singular -ie nouns whose plural is -ies (cookies → cookie, not cooky). */
const PLURAL_IES_TO_IE = new Set(['cookie', 'brownie', 'bogie']);

export function singularizeToken(token: string): string {
  if (token === 'halves') return 'half';
  if (PLURAL_KEEP_TOKENS.has(token)) return token;
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) {
    const stem = token.slice(0, -3);
    const asIe = `${stem}ie`;
    if (PLURAL_IES_TO_IE.has(asIe)) return asIe;
    return `${stem}y`;
  }
  if (token.endsWith('oes') && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith('es') && token.length > 4) {
    const stem = token.slice(0, -2);
    if (stem.endsWith('sh') || stem.endsWith('ch') || stem.endsWith('ss') || stem.endsWith('x')) {
      return stem;
    }
  }
  if (
    token.endsWith('s') &&
    !token.endsWith('ss') &&
    !token.endsWith('as') &&
    !token.endsWith('us') &&
    !token.endsWith('is')
  ) {
    return token.slice(0, -1);
  }
  return token;
}

/** "minced garlic" → garlic; keep "sliced black olives" (3+ tokens). */
function stripLeadingPrepTokens(tokens: string[]): string[] {
  if (tokens.length === 2 && LEADING_PREP_TWO_WORD.has(tokens[0] ?? '')) {
    return tokens.slice(1);
  }
  return tokens;
}

function stripTrailingPrepTokens(tokens: string[]): string[] {
  if (tokens.length > 1 && LEADING_PREP_WORDS.has(tokens[tokens.length - 1] ?? '')) {
    return tokens.slice(0, -1);
  }
  return tokens;
}

export function tokenizeIngredientNameCore(value: string): string[] {
  const normalized = normalizeIngredientNameCore(value);
  if (!normalized) return [];
  const tokens = normalized
    .split(' ')
    .filter((t) => t.length > 0 && !STRIP_TOKENS.has(t) && !/^\d+(\.\d+)?$/.test(t))
    .map(singularizeToken);
  return stripTrailingPrepTokens(stripLeadingPrepTokens(tokens));
}

export function canonicalIngredientPhraseCore(value: string): string {
  return tokenizeIngredientNameCore(value).join(' ');
}

/** Maps canonical ingredient phrase → synonym group key (built once at module load). */
export const PHRASE_TO_SYNONYM_GROUP = new Map<string, string>();

function buildSynonymLookup(): void {
  for (const [canonical, synonyms] of Object.entries(INGREDIENT_SYNONYMS)) {
    for (const member of [canonical, ...synonyms]) {
      const phrase = canonicalIngredientPhraseCore(member);
      if (phrase) PHRASE_TO_SYNONYM_GROUP.set(phrase, canonical);
      const normalized = normalizeIngredientNameCore(member);
      if (normalized) PHRASE_TO_SYNONYM_GROUP.set(normalized, canonical);
    }
  }
}

interface CategoryMemberIndex {
  raw: string;
  tokens: string[];
  phrase: string;
  singleToken: string | null;
}

export const CATEGORY_MEMBER_INDEX: Record<string, CategoryMemberIndex[]> = {};

function buildCategoryMemberIndex(): void {
  for (const [family, members] of Object.entries(INGREDIENT_CATEGORY_GROUPS)) {
    CATEGORY_MEMBER_INDEX[family] = members.map((member) => {
      const tokens = tokenizeIngredientNameCore(member);
      return {
        raw: member,
        tokens,
        phrase: tokens.join(' '),
        singleToken: tokens.length === 1 ? (tokens[0] ?? null) : null,
      };
    });
  }
}

buildSynonymLookup();
buildCategoryMemberIndex();
