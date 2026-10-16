import { DataError } from './errors';
import type { Identified, ListChange } from './listOps';
import type { PantryItem, PantryItemRow } from './rows';

/**
 * Pure helpers for the pantry mutations in pantryMutations.ts: field types, checks,
 * column mapping and the placeholder row. No network, so tests/pantryFields.test.ts can run them.
 */

/** The fields a person can set on a pantry row. */
export type PantryItemFields = {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  /** 'pantry' | 'fridge' | 'spice_rack' (the column is free text). */
  location: string;
  /** 'YYYY-MM-DD' or null. */
  expiresOn: string | null;
};

export type AddPantryItemVars = PantryItemFields & {
  ingredientId: string;
  /** Placeholder id shown until the server answers (from tempId()). */
  tempId: string;
};

export type EditPantryItemVars = { id: string; patch: Partial<PantryItemFields> };
export type RemovePantryItemVars = { id: string };
/** The row the server returned from the delete. */
export type RestorePantryItemVars = { row: PantryItem };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const PANTRY_FIELD_ERRORS = {
  name: 'Enter an item name.',
  quantity: 'Quantity must be zero or more.',
  expiresOn: 'Use-by date must look like 2026-10-20.',
} as const;

/** Refuses bad input before anything is sent (DataError 'invalid'). Only checks the fields given. */
export function validatePantryFields(fields: Partial<PantryItemFields>): void {
  if (fields.name !== undefined && !fields.name.trim()) {
    throw new DataError('invalid', PANTRY_FIELD_ERRORS.name);
  }
  if (fields.quantity !== undefined && (!Number.isFinite(fields.quantity) || fields.quantity < 0)) {
    throw new DataError('invalid', PANTRY_FIELD_ERRORS.quantity);
  }
  if (fields.expiresOn !== undefined && fields.expiresOn !== null && !DATE_ONLY.test(fields.expiresOn)) {
    throw new DataError('invalid', PANTRY_FIELD_ERRORS.expiresOn);
  }
}

/** Name and unit as they are saved: trimmed, and an empty unit becomes 'each'. */
export function cleanPantryFields<T extends Partial<PantryItemFields>>(fields: T): T {
  const out = { ...fields };
  if (out.name !== undefined) out.name = out.name.trim();
  if (out.unit !== undefined) out.unit = out.unit.trim() || 'each';
  return out;
}

/** snake_case columns for the fields that are set. */
export function pantryFieldsToColumns(fields: Partial<PantryItemFields>): Partial<PantryItemRow> {
  const clean = cleanPantryFields(fields);
  const row: Partial<PantryItemRow> = {};
  if (clean.name !== undefined) row.name = clean.name;
  if (clean.category !== undefined) row.category = clean.category;
  if (clean.quantity !== undefined) row.quantity = clean.quantity;
  if (clean.unit !== undefined) row.unit = clean.unit;
  if (clean.location !== undefined) row.location = clean.location;
  if (clean.expiresOn !== undefined) row.expires_on = clean.expiresOn;
  return row;
}

/** What the list shows for a new row before the server answers. */
export function placeholderPantryItem(userId: string | null, vars: AddPantryItemVars, now = new Date()): PantryItem {
  const clean = cleanPantryFields(vars);
  return {
    id: vars.tempId,
    userId: userId ?? '',
    ingredientId: vars.ingredientId,
    name: clean.name,
    category: clean.category,
    quantity: clean.quantity,
    unit: clean.unit,
    location: clean.location,
    photoUrl: null,
    expiresOn: clean.expiresOn,
    updatedAt: now.toISOString(),
    scanPhotoPath: null,
  };
}

/**
 * Undo of a delete: puts the row back where it would sort, unless it is already there
 * (a refetch got there first). Reverting removes it again.
 */
export function restoreItem<T extends Identified>(row: T): ListChange<T> {
  return {
    apply: (list) => (list.some((item) => item.id === row.id) ? [...list] : [...list, row]),
    revert: (current, snapshot) =>
      snapshot.some((item) => item.id === row.id) ? [...current] : current.filter((item) => item.id !== row.id),
  };
}

// ------------------------------------------------------------- clear (many rows)

/** Clear several rows at once: the ids of the rows the person saw and confirmed. */
export type ClearPantryItemsVars = { ids: readonly string[] };
/** The rows the server returned from a clear (for Undo). */
export type RestorePantryItemsVars = { rows: readonly PantryItem[] };

/**
 * How many ids go in one delete request. The ids travel in the address (`id=in.(...)`),
 * so a very large pantry is split to keep each address short. Up to this many items is
 * one request.
 */
export const CLEAR_BATCH_SIZE = 100;

/** Splits a list into runs of at most `size` (a size under 1 counts as 1). */
export function chunked<T>(list: readonly T[], size: number = CLEAR_BATCH_SIZE): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += step) out.push(list.slice(i, i + step));
  return out;
}

/** The columns that put a deleted row back exactly as it was (same id and values). */
export function pantryRestoreColumns(owner: string, item: PantryItem, now = new Date()): PantryItemRow {
  return {
    id: item.id,
    user_id: owner,
    ingredient_id: item.ingredientId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    photo_url: item.photoUrl,
    expires_on: item.expiresOn,
    scan_photo_path: item.scanPhotoPath,
    updated_at: now.toISOString(),
  };
}

/** Remove several rows. Undo puts back the ones that are missing, in their old order. */
export function removeMany<T extends Identified>(ids: readonly string[]): ListChange<T> {
  const gone = new Set(ids);
  return {
    apply: (list) => list.filter((item) => !gone.has(item.id)),
    revert: (current, snapshot) => {
      const present = new Set(current.map((item) => item.id));
      const back = new Set(snapshot.filter((item) => gone.has(item.id) && !present.has(item.id)).map((item) => item.id));
      if (back.size === 0) return [...current];
      // Snapshot order for rows that were there before; anything new stays at the end.
      const currentById = new Map(current.map((item) => [item.id, item] as const));
      const ordered: T[] = [];
      for (const item of snapshot) {
        const now = currentById.get(item.id);
        if (back.has(item.id)) ordered.push(item);
        else if (now) {
          ordered.push(now);
          currentById.delete(item.id);
        }
      }
      return [...ordered, ...currentById.values()];
    },
  };
}

/** Undo of a clear: put rows back unless already there (a refetch got there first). */
export function restoreMany<T extends Identified>(rows: readonly T[]): ListChange<T> {
  const ids = new Set(rows.map((row) => row.id));
  return {
    apply: (list) => {
      const present = new Set(list.map((item) => item.id));
      return [...list, ...rows.filter((row) => !present.has(row.id))];
    },
    revert: (current, snapshot) => {
      const before = new Set(snapshot.map((item) => item.id));
      return current.filter((item) => !ids.has(item.id) || before.has(item.id));
    },
  };
}
