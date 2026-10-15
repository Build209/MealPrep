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
