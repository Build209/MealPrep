import { DEFAULT_PANTRY_VIEW_MODE, isPantryViewMode, PANTRY_VIEW_MODE_STORAGE_KEY, type PantryViewMode } from './shelves/packages';

/**
 * Remembers Shelves or List on this device. Web only for now (browser storage); phone builds
 * have no storage adapter yet and start on the default each time. Never throws: private
 * windows and blocked storage just fall back to the default.
 */

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

function storage(): StorageLike | null {
  try {
    const s = (globalThis as { localStorage?: StorageLike }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

export function readPantryViewMode(store: StorageLike | null = storage()): PantryViewMode {
  try {
    const raw = store?.getItem(PANTRY_VIEW_MODE_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isPantryViewMode(parsed) ? parsed : DEFAULT_PANTRY_VIEW_MODE;
  } catch {
    return DEFAULT_PANTRY_VIEW_MODE;
  }
}

export function writePantryViewMode(mode: PantryViewMode, store: StorageLike | null = storage()): void {
  try {
    store?.setItem(PANTRY_VIEW_MODE_STORAGE_KEY, JSON.stringify(mode));
  } catch {
    // Storage full or blocked: the choice is simply not remembered.
  }
}
