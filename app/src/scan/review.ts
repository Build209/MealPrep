/**
 * The review list between a scan and the pantry: every detected item can be edited (name,
 * quantity, unit, place), ticked or removed before anything is saved. Each row is matched
 * against the pantry as the server has it (src/kitchen/pantryMatch.ts): shelf items already
 * there are shown as such and left out unless the person adds them; receipt lines add to a
 * matching row with the same unit. Pure functions only (tests/scan-review.test.ts).
 * Saving goes through src/data/pantryScanSave.ts.
 */
import { areSameIngredientForPantryDedupe } from '../kitchen/ingredientNormalize';
import { findAlreadyInPantry, matchReceiptLine, roundQuantity, sameUnit, type PantryMatchRow } from '../kitchen/pantryMatch';
import { fileScannedItem } from '../kitchen/scanFiling';
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
  /** Which kind of photo the row came from: shelf rows skip what is in the pantry, receipt rows add to it. */
  kind: ScanKind;
  /**
   * The person's tick, once they touch it. Left out, the row is kept unless it is a shelf item
   * already in the pantry (see isIncluded).
   */
  include?: boolean;
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
 * the pantry) is used. The function's category and place are checked first
 * (src/kitchen/scanFiling.ts: no stew as cookware, no juice as dry goods), and on a shelf scan
 * near-duplicates ("Pickles", "Dill Pickles", "Vlasic Pickle Spears") become one row.
 */
export function toReviewRows(items: readonly DetectedItem[], kind: ScanKind, place: ScanPlace, keyPrefix = 'scan'): ReviewRow[] {
  const rows: ReviewRow[] = [];
  items.forEach((item, index) => {
    if (item.confidence < JUNK_CONFIDENCE) return;
    const filed = fileScannedItem(item, kind === 'receipt' ? 'pantry' : place, kind === 'receipt' ? null : place);
    rows.push({
      key: `${keyPrefix}-${index}`,
      name: displayName(item.name),
      quantityText: formatQuantity(item.quantity),
      unit: item.unit,
      place: filed.storage,
      category: filed.category,
      confidence: item.confidence,
      needsCheck: item.confidence < CHECK_CONFIDENCE,
      kind,
    });
  });
  // Receipt lines stay one per line: planSave already adds lines for the same pantry row together.
  return kind === 'shelf' ? mergeNearDuplicates(rows) : rows;
}

/**
 * Rows naming the same ingredient (same phrase or synonym group, brands and plurals ignored).
 * Same unit: one row with the quantities added, kept under the first name. Another unit: both
 * kept, each marked "Check this" so the person decides.
 */
export function mergeNearDuplicates(rows: readonly ReviewRow[]): ReviewRow[] {
  const out: ReviewRow[] = [];
  for (const row of rows) {
    const twinIndex = out.findIndex((kept) => areSameIngredientForPantryDedupe(kept.name, row.name));
    if (twinIndex < 0) {
      out.push({ ...row });
      continue;
    }
    const twin = out[twinIndex]!;
    if (sameUnit(twin.unit, row.unit)) {
      const sum = (Number(twin.quantityText) || 0) + (Number(row.quantityText) || 0);
      out[twinIndex] = {
        ...twin,
        quantityText: formatQuantity(Math.min(sum, MAX_QUANTITY)),
        confidence: Math.max(twin.confidence, row.confidence),
        needsCheck: twin.needsCheck && row.needsCheck,
      };
      continue;
    }
    out[twinIndex] = { ...twin, needsCheck: true };
    out.push({ ...row, needsCheck: true });
  }
  return out;
}

export type RowEdit = Partial<Pick<ReviewRow, 'name' | 'quantityText' | 'unit' | 'place'>>;

export function editRow(rows: readonly ReviewRow[], key: string, edit: RowEdit): ReviewRow[] {
  return rows.map((row) => (row.key === key ? { ...row, ...edit, needsCheck: false } : row));
}

export function setIncluded(rows: readonly ReviewRow[], key: string, include: boolean): ReviewRow[] {
  return rows.map((row) => (row.key === key ? { ...row, include } : row));
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

/** An existing pantry row whose quantity a receipt raises: `quantity` is the new total. */
export type PantryTopUp = { id: string; name: string; quantity: number; unit: string };

/** What a review row means for the pantry as it is now (derived on every render, never stored). */
export type RowPantryStatus =
  | { kind: 'new' }
  /** Shelf scan: this is already in the pantry. */
  | { kind: 'already'; name: string; quantity: number; unit: string }
  /** Receipt: saving adds the quantity to this pantry row. */
  | { kind: 'top-up'; name: string; quantity: number; unit: string }
  /** Receipt: the pantry has this in another unit, so it is saved as its own row. */
  | { kind: 'other-unit'; name: string; quantity: number; unit: string };

function savedName(row: Pick<ReviewRow, 'name'>): string {
  return displayName(row.name).slice(0, 120);
}

export function pantryStatusFor(row: ReviewRow, pantry: readonly PantryMatchRow[]): RowPantryStatus {
  const name = savedName(row);
  if (!name) return { kind: 'new' };
  if (row.kind === 'shelf') {
    const found = findAlreadyInPantry(name, pantry);
    return found ? { kind: 'already', name: found.name, quantity: found.quantity, unit: found.unit } : { kind: 'new' };
  }
  const match = matchReceiptLine({ name, ingredientId: ingredientIdFor(name), unit: row.unit }, pantry);
  if (match.kind === 'new') return { kind: 'new' };
  return { kind: match.kind, name: match.row.name, quantity: match.row.quantity, unit: match.row.unit };
}

/** Kept for saving: the person's tick, else everything except shelf items already in the pantry. */
export function isIncluded(row: ReviewRow, status: RowPantryStatus): boolean {
  return row.include ?? status.kind !== 'already';
}

export function includedCount(rows: readonly ReviewRow[], pantry: readonly PantryMatchRow[]): number {
  return rows.filter((row) => isIncluded(row, pantryStatusFor(row, pantry))).length;
}

export type SavePlan =
  | { ok: true; inserts: NewPantryRow[]; topUps: PantryTopUp[] }
  | { ok: false; problems: Record<string, string> };

/**
 * Every kept row checked against the pantry as the server has it. Either all of them become
 * inserts and top-ups, or the problems are returned by row key. Unticked rows are skipped.
 * Several receipt lines for the same pantry row add up into one top-up.
 */
export function planSave(userId: string, rows: readonly ReviewRow[], pantry: readonly PantryMatchRow[] = []): SavePlan {
  const problems: Record<string, string> = {};
  const inserts: NewPantryRow[] = [];
  const topUps = new Map<string, PantryTopUp>();
  for (const row of rows) {
    if (!isIncluded(row, pantryStatusFor(row, pantry))) continue;
    const problem = rowProblem(row);
    if (problem) {
      problems[row.key] = problem;
      continue;
    }
    const name = savedName(row);
    const unit = row.unit.trim().slice(0, 32);
    const quantity = parseQuantity(row.quantityText) as number;
    if (row.kind === 'receipt') {
      const match = matchReceiptLine({ name, ingredientId: ingredientIdFor(name), unit }, pantry);
      if (match.kind === 'top-up') {
        const prior = topUps.get(match.row.id);
        const base = prior ? prior.quantity : match.row.quantity;
        topUps.set(match.row.id, { id: match.row.id, name: match.row.name, unit: match.row.unit, quantity: roundQuantity(base + quantity) });
        continue;
      }
    }
    inserts.push({
      user_id: userId,
      ingredient_id: ingredientIdFor(name),
      name,
      category: row.category,
      quantity,
      unit,
      location: row.place,
    });
  }
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  return { ok: true, inserts, topUps: [...topUps.values()] };
}

/** "Saved 2 items to your pantry." or, with receipt top-ups, what was added and what went up. */
export function savedMessage(added: number, toppedUp: number): string {
  const items = (n: number) => (n === 1 ? '1 item' : `${n} items`);
  if (toppedUp === 0) return `Saved ${items(added)} to your pantry.`;
  const had = toppedUp === 1 ? '1 item you already had' : `${toppedUp} items you already had`;
  if (added === 0) return `Added to ${had}.`;
  return `Saved ${items(added)} to your pantry and added to ${had}.`;
}

export function saveButtonLabel(count: number): string {
  if (count === 0) return 'Nothing to save';
  return count === 1 ? 'Save 1 item to pantry' : `Save ${count} items to pantry`;
}
