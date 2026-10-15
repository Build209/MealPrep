import { DataError, messages, toDataError } from './errors';
import type { Identified, ListChange } from './listOps';
import { pantryItemFromRow, type PantryItem, type PantryItemRow } from './rows';

/**
 * Grocery rows (grocery_list_items in db/supabase/migrations/20261013000000_live_baseline.sql),
 * their mapping, and the pure helpers the grocery hooks use. No network, so tests can run them.
 */

// ---------------------------------------------------------- grocery_list_items

export type GroceryOrigin = 'plan' | 'add_missing' | 'manual'; // check grocery_list_items_origin_check

export type GroceryItemRow = {
  id: string; // uuid, default gen_random_uuid()
  user_id: string; // uuid, references profiles(id)
  ingredient_id: string;
  name: string;
  category: string;
  quantity: number | string; // numeric (PostgREST may send it as a string)
  unit: string;
  checked: boolean; // default false
  source_recipe_ids: unknown; // jsonb, default '[]'
  updated_at: string; // timestamptz
  origin: string; // default 'plan'
  planned_meal_links: unknown; // jsonb, default '[]'
};

/** A planned meal a row was bought for (filled by the planner in phase 3; read-only here). */
export type GroceryPlannedMealLink = {
  mealPlanItemId: string;
  scheduledOn: string | null;
  mealSlot: string | null;
  mealTitle: string;
};

export type GroceryItem = {
  id: string;
  userId: string;
  ingredientId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  checked: boolean;
  sourceRecipeIds: string[];
  updatedAt: string;
  origin: GroceryOrigin;
  plannedMealLinks: GroceryPlannedMealLink[];
};

export const GROCERY_ITEM_COLUMNS =
  'id, user_id, ingredient_id, name, category, quantity, unit, checked, source_recipe_ids, updated_at, origin, planned_meal_links';

export function groceryItemFromRow(row: GroceryItemRow): GroceryItem {
  return {
    id: row.id,
    userId: row.user_id,
    ingredientId: row.ingredient_id,
    name: row.name,
    category: row.category,
    quantity: toNumber(row.quantity),
    unit: row.unit,
    checked: row.checked === true,
    sourceRecipeIds: Array.isArray(row.source_recipe_ids)
      ? row.source_recipe_ids.filter((id): id is string => typeof id === 'string')
      : [],
    updatedAt: row.updated_at,
    origin: normalizeGroceryOrigin(row.origin, row.ingredient_id),
    plannedMealLinks: plannedMealLinksFromJson(row.planned_meal_links),
  };
}

export function groceryItemToRow(item: GroceryItem): GroceryItemRow {
  return {
    id: item.id,
    user_id: item.userId,
    ingredient_id: item.ingredientId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    checked: item.checked,
    source_recipe_ids: item.sourceRecipeIds,
    updated_at: item.updatedAt,
    origin: item.origin,
    planned_meal_links: item.plannedMealLinks.map((link) => ({
      mealPlanItemId: link.mealPlanItemId,
      scheduledOn: link.scheduledOn,
      mealSlot: link.mealSlot,
      mealTitle: link.mealTitle,
    })),
  };
}

/** Old app (mobile/lib/grocery/origin.ts): unknown values read as 'plan', or 'manual' for manual-* ids. */
export function normalizeGroceryOrigin(value: string | null | undefined, ingredientId: string): GroceryOrigin {
  if (value === 'plan' || value === 'add_missing' || value === 'manual') return value;
  return ingredientId.startsWith('manual-') ? 'manual' : 'plan';
}

function plannedMealLinksFromJson(value: unknown): GroceryPlannedMealLink[] {
  if (!Array.isArray(value)) return [];
  const links: GroceryPlannedMealLink[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.mealPlanItemId !== 'string') continue;
    links.push({
      mealPlanItemId: r.mealPlanItemId,
      scheduledOn: typeof r.scheduledOn === 'string' ? r.scheduledOn : null,
      mealSlot: typeof r.mealSlot === 'string' ? r.mealSlot : null,
      mealTitle: typeof r.mealTitle === 'string' ? r.mealTitle : '',
    });
  }
  return links;
}

function toNumber(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ----------------------------------------------------------------- add a row

export type AddGroceryItemVars = {
  ingredientId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  origin: GroceryOrigin;
  /** Placeholder id shown until the server answers (from tempId()). */
  tempId: string;
};

export const GROCERY_FIELD_ERRORS = {
  name: 'Enter an item name.',
  quantity: 'Quantity must be more than zero.',
} as const;

/** Refuses bad input before anything is sent (DataError 'invalid'). */
export function validateGroceryFields(fields: { name?: string; quantity?: number }): void {
  if (fields.name !== undefined && !fields.name.trim()) throw new DataError('invalid', GROCERY_FIELD_ERRORS.name);
  if (fields.quantity !== undefined && (!Number.isFinite(fields.quantity) || fields.quantity <= 0)) {
    throw new DataError('invalid', GROCERY_FIELD_ERRORS.quantity);
  }
}

/** The insert body for a new row (snake_case, owner set by the caller). */
export function groceryInsertColumns(owner: string, vars: AddGroceryItemVars) {
  return {
    user_id: owner,
    ingredient_id: vars.ingredientId,
    name: vars.name.trim(),
    category: vars.category,
    quantity: vars.quantity,
    unit: vars.unit.trim() || 'each',
    checked: false,
    origin: vars.origin,
  };
}

/** What the list shows for a new row before the server answers. */
export function placeholderGroceryItem(userId: string | null, vars: AddGroceryItemVars, now = new Date()): GroceryItem {
  return {
    id: vars.tempId,
    userId: userId ?? '',
    ingredientId: vars.ingredientId,
    name: vars.name.trim(),
    category: vars.category,
    quantity: vars.quantity,
    unit: vars.unit.trim() || 'each',
    checked: false,
    sourceRecipeIds: [],
    updatedAt: now.toISOString(),
    origin: vars.origin,
    plannedMealLinks: [],
  };
}

/** The insert body that puts a cleared row back exactly (same id and values). */
export function groceryRestoreColumns(owner: string, item: GroceryItem) {
  const row = groceryItemToRow(item);
  return { ...row, user_id: owner, updated_at: new Date().toISOString() };
}

// --------------------------------------------------------- tick and untick

export type TickGroceryVars = {
  id: string;
  /** The pantry row the screen thinks this adds to (a hint; the server checks it). */
  pantryItemId: string | null;
  /** Where a new pantry row is kept if nothing matches. */
  location: string;
};

export type UntickGroceryVars = {
  id: string;
  /** From the tick's answer, when there is one (Undo). Null: the server matches by name and unit. */
  pantryItemId: string | null;
  /** True when the tick made a new pantry row (Undo then removes that row). */
  created: boolean;
};

export type TickResult = {
  grocery: GroceryItem;
  pantry: PantryItem | null;
  /** The tick made a new pantry row. */
  created: boolean;
  /** False when the row was already ticked (nothing was added). */
  changed: boolean;
};

export type UntickResult = {
  grocery: GroceryItem;
  /** The pantry row after the change, or the deleted row when `deleted`. */
  pantry: PantryItem | null;
  deleted: boolean;
  changed: boolean;
};

type RpcAnswer = {
  grocery?: GroceryItemRow | null;
  pantry?: PantryItemRow | null;
  created?: boolean;
  deleted?: boolean;
  changed?: boolean;
};

function readAnswer(raw: unknown): RpcAnswer & { grocery: GroceryItemRow } {
  const answer = (raw ?? {}) as RpcAnswer;
  if (!answer.grocery || typeof answer.grocery !== 'object') {
    throw new DataError('server', messages.server);
  }
  return answer as RpcAnswer & { grocery: GroceryItemRow };
}

export function tickResultFromJson(raw: unknown): TickResult {
  const a = readAnswer(raw);
  return {
    grocery: groceryItemFromRow(a.grocery),
    pantry: a.pantry ? pantryItemFromRow(a.pantry) : null,
    created: a.created === true,
    changed: a.changed === true,
  };
}

export function untickResultFromJson(raw: unknown): UntickResult {
  const a = readAnswer(raw);
  return {
    grocery: groceryItemFromRow(a.grocery),
    pantry: a.pantry ? pantryItemFromRow(a.pantry) : null,
    deleted: a.deleted === true,
    changed: a.changed === true,
  };
}

/**
 * Errors from the tick functions: 'P0002' (row gone or not this person's) reads as not found;
 * a missing function (not applied to this database yet) gets its own plain message.
 */
export function groceryRpcError(error: unknown): DataError {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'P0002') return new DataError('not-found', messages.notFound, { cause: error });
  if (code === 'PGRST202' || code === '42883') {
    return new DataError('server', "Ticking isn't available on this server yet.", { cause: error });
  }
  return toDataError(error);
}

// ------------------------------------------------------------- list changes

/** Put one pantry row (the server's copy) into a pantry list: replace by id, or add it. */
export function upsertPantryRow(list: readonly PantryItem[], row: PantryItem): PantryItem[] {
  return list.some((item) => item.id === row.id) ? list.map((item) => (item.id === row.id ? row : item)) : [...list, row];
}

/** Clear ticked: remove every ticked row. Undo puts back only the rows this change removed. */
export function removeChecked<T extends Identified & { checked: boolean }>(): ListChange<T> {
  return {
    apply: (list) => list.filter((item) => !item.checked),
    revert: (current, snapshot) => {
      const ids = new Set(current.map((item) => item.id));
      const back = snapshot.filter((item) => item.checked && !ids.has(item.id));
      return [...current, ...back];
    },
  };
}

/** Undo of Clear ticked: put rows back unless already there (a refetch got there first). */
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
