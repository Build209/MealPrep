/**
 * The review list between a scan and the pantry: every detected item can be edited (name,
 * quantity, unit, place) or removed before anything is saved. Pure functions only
 * (tests/scan-review.test.ts). Saving goes through src/data/pantryScanSave.ts.
 */
import type { DetectedItem, PantryCategory, ScanKind, ScanPlace } from './request';

export type ReviewRow = {
  key: string;
  name: string;
  /** Kept as typed so a half-typed number ("1.") is not rewritten under the person's thumb. */
  quantityText: string;
  unit: string;
  place: ScanPlace;
  category: PantryCategory;
  confidence: number;
  /** Low model confidence: shown with "Check this". */
  needsCheck: boolean;
};

/** Below this the old app dropped a detection as junk. */
export const JUNK_CONFIDENCE = 0.25;
/** Below this the row is marked "Check this" (old app: LOW_CONFIDENCE_THRESHOLD). */
export const CHECK_CONFIDENCE = 0.55;
export const MAX_QUANTITY = 9999;

/** "black beans" -> "Black Beans"; short all-caps words (BBQ) stay as they are. */
export function displayName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word.length <= 3 && word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** The pantry's ingredient key for a name, as the old app made it ("Black Beans" -> "black-beans"). */
export function ingredientIdFor(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return slug || 'ingredient';
}

export function formatQuantity(quantity: number): string {
  return String(Math.round(quantity * 100) / 100);
}

/**
 * Rows for the review list. A shelf scan puts items where the function says they belong, else
 * where the photo was taken; a receipt has no place of its own, so the function's guess (or
 * the pantry) is used.
 */
export function toReviewRows(items: readonly DetectedItem[], kind: ScanKind, place: ScanPlace, keyPrefix = 'scan'): ReviewRow[] {
  const rows: ReviewRow[] = [];
  items.forEach((item, index) => {
    if (item.confidence < JUNK_CONFIDENCE) return;
    rows.push({
      key: `${keyPrefix}-${index}`,
      name: displayName(item.name),
      quantityText: formatQuantity(item.quantity),
      unit: item.unit,
      place: item.storage ?? (kind === 'receipt' ? 'pantry' : place),
      category: item.category,
      confidence: item.confidence,
      needsCheck: item.confidence < CHECK_CONFIDENCE,
    });
  });
  return rows;
}

export type RowEdit = Partial<Pick<ReviewRow, 'name' | 'quantityText' | 'unit' | 'place'>>;

export function editRow(rows: readonly ReviewRow[], key: string, edit: RowEdit): ReviewRow[] {
  return rows.map((row) => (row.key === key ? { ...row, ...edit, needsCheck: false } : row));
}

export function removeRow(rows: readonly ReviewRow[], key: string): ReviewRow[] {
  return rows.filter((row) => row.key !== key);
}

/** A quantity a person typed, or null when it is not a number above zero. */
export function parseQuantity(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_QUANTITY) return null;
  return n;
}

/** What is wrong with a row, in words, or null when it can be saved. */
export function rowProblem(row: ReviewRow): string | null {
  if (!row.name.trim()) return 'Add a name or remove this item.';
  if (parseQuantity(row.quantityText) === null) return `Quantity must be a number above 0 (up to ${MAX_QUANTITY}).`;
  if (!row.unit.trim()) return 'Add a unit, like "each" or "can".';
  return null;
}

/** The pantry_items columns a scan writes. id and updated_at come from the server. */
export type NewPantryRow = {
  user_id: string;
  ingredient_id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  location: ScanPlace;
};

export type SavePlan = { ok: true; rows: NewPantryRow[] } | { ok: false; problems: Record<string, string> };

/** Every row checked; either all of them become insert rows, or the problems are returned by row key. */
export function planSave(userId: string, rows: readonly ReviewRow[]): SavePlan {
  const problems: Record<string, string> = {};
  const out: NewPantryRow[] = [];
  for (const row of rows) {
    const problem = rowProblem(row);
    if (problem) {
      problems[row.key] = problem;
      continue;
    }
    const name = displayName(row.name).slice(0, 120);
    out.push({
      user_id: userId,
      ingredient_id: ingredientIdFor(name),
      name,
      category: row.category,
      quantity: parseQuantity(row.quantityText) as number,
      unit: row.unit.trim().slice(0, 32),
      location: row.place,
    });
  }
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return { ok: true, rows: out };
}

export function saveButtonLabel(count: number): string {
  if (count === 0) return 'Nothing to save';
  return count === 1 ? 'Save 1 item to pantry' : `Save ${count} items to pantry`;
}
