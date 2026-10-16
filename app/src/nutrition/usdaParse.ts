/**
 * Reads USDA FoodData Central search results (via the usda-proxy edge function, action 'search').
 * Pure: no network, no React (tests/nutrition-usda-parse.test.ts).
 *
 * Search result shape: { foods: [{ fdcId, description, dataType, foodNutrients: [
 *   { nutrientId: 1008, nutrientNumber: '208', unitName: 'KCAL', value: 52 } ] }] }.
 * The /food/{id} detail shape nests the nutrient: { nutrient: { id, number, unitName }, amount }.
 * Both are read. All values are per 100 g. Nothing is guessed: a food missing energy or any of
 * the three macros is skipped.
 */

export type Per100g = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type UsdaFoodRef = { fdcId: number; description: string; per100g: Per100g };

const ID_KCAL = 1008;
const ID_KCAL_ATWATER_GENERAL = 2047;
const ID_KCAL_ATWATER_SPECIFIC = 2048;
const ID_KJ = 1062;
const ID_PROTEIN = 1003;
const ID_FAT = 1004;
const ID_CARBS = 1005;

const NUMBER_TO_ID: Record<string, number> = { '208': ID_KCAL, '268': ID_KJ, '203': ID_PROTEIN, '204': ID_FAT, '205': ID_CARBS };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

type NutrientRead = { id: number; value: number; unit: string };

function readNutrient(raw: unknown): NutrientRead | null {
  if (!isObj(raw)) return null;
  const nested = isObj(raw.nutrient) ? raw.nutrient : null;
  let id = finite(nested?.id) ?? finite(raw.nutrientId);
  if (id === null) {
    const num = nested?.number ?? raw.nutrientNumber;
    if (typeof num === 'string') id = NUMBER_TO_ID[num.trim()] ?? null;
  }
  const value = finite(raw.value) ?? finite(raw.amount);
  if (id === null || value === null) return null;
  const unit = String((nested?.unitName ?? raw.unitName) ?? '').trim().toLowerCase();
  return { id, value, unit };
}

/** Per-100 g energy and macros from a food's nutrient list, or null if any is missing. */
export function per100gFromNutrients(list: unknown): Per100g | null {
  if (!Array.isArray(list)) return null;
  const by = new Map<number, NutrientRead>();
  for (const raw of list) {
    const n = readNutrient(raw);
    if (n && !by.has(n.id)) by.set(n.id, n);
  }
  let kcal: number | null = null;
  const direct = by.get(ID_KCAL);
  if (direct && (direct.unit === '' || direct.unit === 'kcal')) kcal = direct.value;
  if (kcal === null) {
    const atwater = by.get(ID_KCAL_ATWATER_GENERAL) ?? by.get(ID_KCAL_ATWATER_SPECIFIC);
    if (atwater && (atwater.unit === '' || atwater.unit === 'kcal')) kcal = atwater.value;
  }
  if (kcal === null) {
    const kj = by.get(ID_KJ);
    if (kj && kj.unit === 'kj') kcal = kj.value / 4.184;
  }
  const protein = by.get(ID_PROTEIN)?.value;
  const fat = by.get(ID_FAT)?.value;
  const carbs = by.get(ID_CARBS)?.value;
  if (kcal === null || protein === undefined || fat === undefined || carbs === undefined) return null;
  return { kcal, proteinG: protein, carbsG: carbs, fatG: fat };
}

const STOP = new Set(['and', 'or', 'of', 'the', 'with', 'in', 'a']);
/** Words that say the food is prepared or processed; a plain ingredient should not pick them. */
const PREPARED = new Set([
  'cooked', 'fried', 'baked', 'boiled', 'canned', 'dried', 'dehydrated', 'frozen', 'roasted', 'toasted', 'stewed', 'breaded',
  'restaurant', 'fast', 'prepared', 'sweetened', 'juice', 'powder', 'flavored', 'candied', 'pickled', 'smoked', 'cured',
]);

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOP.has(w))
    .map(stem);
}

/** About 0..1.2: how well a USDA description fits a normalised ingredient name. 0 is no match. */
export function matchScore(query: string, description: string, dataType?: string): number {
  const q = tokens(query);
  if (q.length === 0) return 0;
  const d = tokens(description);
  const dset = new Set(d);
  const hit = q.filter((t) => dset.has(t)).length;
  const fraction = hit / q.length;
  if (fraction < 0.5) return 0;
  const qset = new Set(q);
  let score = fraction;
  // USDA names lead with the food itself ("Flour, wheat, all-purpose"); reward the first word matching.
  if (d[0] !== undefined && qset.has(d[0])) score += 0.1;
  if (dset.has('raw')) score += 0.05;
  for (const w of d) if (PREPARED.has(w) && !qset.has(w)) score -= 0.15;
  score -= 0.01 * Math.max(0, d.length - q.length);
  if (dataType === 'Foundation') score += 0.02;
  return Math.max(score, 0.001);
}

/** Best usable food (complete nutrients, at least half the name matched) from a search response, or null. */
export function pickBestFood(query: string, response: unknown): UsdaFoodRef | null {
  if (!isObj(response) || !Array.isArray(response.foods)) return null;
  let best: { score: number; ref: UsdaFoodRef } | null = null;
  for (const raw of response.foods) {
    if (!isObj(raw)) continue;
    const fdcId = finite(raw.fdcId);
    const description = typeof raw.description === 'string' ? raw.description : '';
    if (fdcId === null || !description) continue;
    const score = matchScore(query, description, typeof raw.dataType === 'string' ? raw.dataType : undefined);
    if (score <= 0) continue;
    const per100g = per100gFromNutrients(raw.foodNutrients);
    if (!per100g) continue;
    if (!best || score > best.score) best = { score, ref: { fdcId, description, per100g } };
  }
  return best ? best.ref : null;
}
