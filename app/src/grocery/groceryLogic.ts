import type { GroceryItem } from '../data/groceryRows';
import { groupGroceryByAisle, manualGroceryFields, type GroceryAisle, type ManualGroceryFields } from '../kitchen/groceryAisles';
import { formatQuantityWithUnit } from '../kitchen/formatQuantity';
import { parseQuantity } from '../pantry/form/itemForm';

/**
 * The Grocery screen as plain data: wording, the add form, row labels and the split into
 * "to buy" (by aisle) and "ticked". Tested in tests/grocery-logic.test.ts.
 */

export const GROCERY_COPY = {
  title: 'Grocery',
  addItem: 'Add item',
  emptyTitle: 'Your list is empty',
  emptyBody: 'Add what you need. Tick it off in the store and it goes straight into your pantry.',
  allTicked: 'All ticked. Clear them when you are done.',
  loadError: "Couldn't load your list.",
  retry: 'Try again',
  summary: (open: number, ticked: number) => `${open} to buy · ${ticked} ticked`,
  tickedSection: 'Ticked',
  tickedHint: 'Already added to your pantry.',
  clearTicked: 'Clear ticked',
  untick: 'Untick',
  tickA11yHint: 'Ticks it off and adds it to your pantry',
  untickA11yHint: 'Puts it back on the list and takes it out of your pantry',
  ticked: (name: string) => `${name} is in your pantry.`,
  unticked: (name: string) => `${name} is back on your list.`,
  cleared: (count: number) => (count === 1 ? 'Cleared 1 ticked item.' : `Cleared ${count} ticked items.`),
  restored: (count: number) => (count === 1 ? '1 item is back.' : `${count} items are back.`),
  undo: 'Undo',
  saveFailed: (message: string) => `Not added. ${message}`,
  tickFailed: (message: string) => `Not ticked. ${message}`,
  untickFailed: (message: string) => `Couldn't untick it. ${message}`,
  clearFailed: (message: string) => `Not cleared. ${message}`,
  undoFailed: (message: string) => `Couldn't undo. ${message}`,
} as const;

export const ADD_FORM_COPY = {
  title: 'Add to your list',
  name: 'Name',
  quantity: 'Quantity',
  unit: 'Unit',
  unitHint: 'For example each, lb, oz, can',
  aisle: (label: string) => `Aisle: ${label}`,
  save: 'Add to list',
  cancel: 'Cancel',
  errors: {
    name: 'Enter an item name.',
    quantity: 'Enter a number more than zero, like 2 or 1.5.',
  },
} as const;

export type GroceryFormValues = { name: string; quantity: string; unit: string };
export type GroceryFormErrors = Partial<Record<'name' | 'quantity', string>>;
export type GroceryFormResult = { ok: true; fields: ManualGroceryFields } | { ok: false; errors: GroceryFormErrors };

export function emptyGroceryForm(): GroceryFormValues {
  return { name: '', quantity: '1', unit: 'each' };
}

/** Checks the add sheet and returns the row to save (aisle guessed from the name, origin 'manual'). */
export function readGroceryForm(values: GroceryFormValues, nowMs = Date.now()): GroceryFormResult {
  const errors: GroceryFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = ADD_FORM_COPY.errors.name;
  const quantity = parseQuantity(values.quantity);
  if (quantity === null || quantity <= 0) errors.quantity = ADD_FORM_COPY.errors.quantity;
  if (errors.name || errors.quantity || quantity === null) return { ok: false, errors };
  return { ok: true, fields: manualGroceryFields({ name, quantity, unit: values.unit }, nowMs) };
}

/** "2 lb", "½ cup", "3 each". */
export function groceryRowDetail(item: Pick<GroceryItem, 'quantity' | 'unit'>): string {
  return formatQuantityWithUnit(item.quantity, item.unit);
}

/** What a screen reader hears for a row's tick box: "Milk, 2 l". */
export function groceryRowLabel(item: Pick<GroceryItem, 'name' | 'quantity' | 'unit'>): string {
  return `${item.name}, ${groceryRowDetail(item)}`;
}

export type GroceryView = {
  /** Unticked rows, by aisle. */
  aisles: GroceryAisle<GroceryItem>[];
  /** Ticked rows, A to Z. */
  ticked: GroceryItem[];
  openCount: number;
};

export function groceryView(items: readonly GroceryItem[]): GroceryView {
  const open = items.filter((item) => !item.checked);
  const ticked = items.filter((item) => item.checked).sort((a, b) => a.name.localeCompare(b.name));
  return { aisles: groupGroceryByAisle(open), ticked, openCount: open.length };
}
