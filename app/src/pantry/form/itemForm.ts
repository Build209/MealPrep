import type { PantryItemFields } from '../../data/pantryFields';
import { inferGroceryCategoryFromName } from '../../kitchen/categorize';
import type { PantryCategory } from '../../kitchen/categories';
import { addDaysToIsoDate, parseIsoDateOnly, todayIsoDate } from '../../kitchen/expiry';
import {
  DEFAULT_PANTRY_STORAGE_LOCATION,
  suggestStorageLocationForPantryItem,
  type PantryStorageLocation,
} from '../../kitchen/storage';
import type { ShelvedItem } from '../types';

/**
 * The add / edit item sheet as plain data: what the fields hold (text, as typed), how they
 * are checked, and what gets saved. Category is never asked for: it is guessed from the name
 * (as the old app's add sheet did), and an edit keeps the saved category unless the name changes.
 */

export type PantryFormValues = {
  name: string;
  quantity: string;
  unit: string;
  location: PantryStorageLocation;
  /** 'YYYY-MM-DD' or '' for none. */
  expiresOn: string;
};

export type PantryFormErrors = Partial<Record<'name' | 'quantity' | 'expiresOn', string>>;

export const PANTRY_FORM_COPY = {
  addTitle: 'Add item',
  editTitle: 'Edit item',
  name: 'Name',
  quantity: 'Quantity',
  unit: 'Unit',
  unitHint: 'For example each, cup, oz, can',
  place: 'Kept in',
  expiresOn: 'Use by (optional)',
  expiresOnHint: 'Year-month-day, for example 2026-10-20',
  noDate: 'No date',
  inDays: (days: number) => (days === 7 ? 'In a week' : `In ${days} days`),
  save: 'Save item',
  saving: 'Saving…',
  cancel: 'Cancel',
  remove: 'Delete item',
  errors: {
    name: 'Enter an item name.',
    quantity: 'Enter a number, like 2 or 1.5.',
    expiresOn: 'Enter a date like 2026-10-20, or leave it empty.',
  },
} as const;

/** Quick use-by picks under the date field (days from today). */
export const QUICK_DATE_DAYS = [3, 7] as const;

export function emptyPantryForm(): PantryFormValues {
  return { name: '', quantity: '1', unit: 'each', location: DEFAULT_PANTRY_STORAGE_LOCATION, expiresOn: '' };
}

/** Trims a number for a text field: 2 → "2", 1.5 → "1.5", 0.3333 → "0.33". */
export function quantityText(quantity: number): string {
  if (!Number.isFinite(quantity)) return '0';
  return String(Math.round(quantity * 100) / 100);
}

export function pantryFormFromItem(item: ShelvedItem): PantryFormValues {
  return {
    name: item.name,
    quantity: quantityText(item.quantity),
    unit: item.unit,
    location: item.location,
    expiresOn: item.expiresOn ? item.expiresOn.slice(0, 10) : '',
  };
}

/**
 * Reads a typed amount: "2", "1.5", "1,5", "1/2", "1 1/2". Null when it is not a number
 * of zero or more.
 */
export function parseQuantity(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (mixed) {
    const whole = Number(mixed[1]);
    const den = Number(mixed[3]);
    return den > 0 ? whole + Number(mixed[2]) / den : null;
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(t);
  if (fraction) {
    const den = Number(fraction[2]);
    return den > 0 ? Number(fraction[1]) / den : null;
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The place a typed name suggests (the sheet follows it until a place is picked by hand). */
export function suggestPlaceForName(name: string): PantryStorageLocation {
  if (!name.trim()) return DEFAULT_PANTRY_STORAGE_LOCATION;
  return suggestStorageLocationForPantryItem(name, inferGroceryCategoryFromName(name));
}

export type PantryFormResult = { ok: true; fields: PantryItemFields } | { ok: false; errors: PantryFormErrors };

/**
 * Checks the sheet and returns what to save. `existing` is the item being edited: its
 * category is kept unless the name changed.
 */
export function readPantryForm(values: PantryFormValues, existing?: Pick<ShelvedItem, 'name' | 'category'>): PantryFormResult {
  const errors: PantryFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = PANTRY_FORM_COPY.errors.name;
  const quantity = parseQuantity(values.quantity);
  if (quantity === null) errors.quantity = PANTRY_FORM_COPY.errors.quantity;
  const date = values.expiresOn.trim();
  if (date && !parseIsoDateOnly(date)) errors.expiresOn = PANTRY_FORM_COPY.errors.expiresOn;
  if (errors.name || errors.quantity || errors.expiresOn || quantity === null) return { ok: false, errors };

  const sameName = existing && existing.name.trim().toLowerCase() === name.toLowerCase();
  const category: PantryCategory = sameName && existing ? existing.category : inferGroceryCategoryFromName(name);
  return {
    ok: true,
    fields: {
      name,
      category,
      quantity,
      unit: values.unit.trim() || 'each',
      location: values.location,
      expiresOn: date || null,
    },
  };
}

/** Only the fields an edit changed (so a save sends a small update). */
export function changedPantryFields(item: ShelvedItem, fields: PantryItemFields): Partial<PantryItemFields> {
  const patch: Partial<PantryItemFields> = {};
  if (fields.name !== item.name) patch.name = fields.name;
  if (fields.category !== item.category) patch.category = fields.category;
  if (fields.quantity !== item.quantity) patch.quantity = fields.quantity;
  if (fields.unit !== item.unit) patch.unit = fields.unit;
  if (fields.location !== item.location) patch.location = fields.location;
  if (fields.expiresOn !== (item.expiresOn ? item.expiresOn.slice(0, 10) : null)) patch.expiresOn = fields.expiresOn;
  return patch;
}

/** A new item's ingredient id, the old app's shape for hand-added items: manual-<slug>-<ms>. */
export function manualIngredientId(name: string, nowMs = Date.now()): string {
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
  return `manual-${slug}-${nowMs}`;
}

/** The date a quick pick fills in. */
export function quickDate(days: number, now = new Date()): string {
  return addDaysToIsoDate(todayIsoDate(now), days);
}
