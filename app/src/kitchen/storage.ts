/**
 * Storage places (pantry, fridge, spice rack): labels, reading stored values, and guessing a
 * place from an item's name and category. Copied from the old app (mobile/config/pantryStorage.ts);
 * the word lists are in storagePhrases.ts.
 */
import type { PantryCategory } from './categories';
import { FRIDGE_PHRASES, PANTRY_SHELF_STABLE_PHRASES, SPICE_RACK_PHRASES } from './storagePhrases';

/** The fields of a pantry item the storage helpers read. */
type StoredItem = { name: string; category: PantryCategory; location: string | null; updatedAt?: string };

export const PANTRY_STORAGE_LOCATIONS = ['pantry', 'fridge', 'spice_rack'] as const;
export type PantryStorageLocation = (typeof PANTRY_STORAGE_LOCATIONS)[number];

export const DEFAULT_PANTRY_STORAGE_LOCATION: PantryStorageLocation = 'pantry';

export const PANTRY_STORAGE_LOCATION_LABELS: Record<PantryStorageLocation, string> = {
  pantry: 'Pantry',
  fridge: 'Fridge',
  spice_rack: 'Spice rack',
};

/** Ionicons glyph names for storage-specific scan actions (add a location in PANTRY_STORAGE_LOCATIONS to extend). */
export const PANTRY_STORAGE_SCAN_ICONS: Record<PantryStorageLocation, string> = {
  pantry: 'file-tray-stacked-outline',
  fridge: 'snow-outline',
  spice_rack: 'leaf-outline',
};

export interface PantryStorageScanAction {
  location: PantryStorageLocation;
  label: string;
  /** e.g. "Scan pantry", "Scan spice rack" */
  scanTitle: string;
  icon: string;
}

export function pantryStorageScanActions(): PantryStorageScanAction[] {
  return PANTRY_STORAGE_LOCATIONS.map((location) => ({
    location,
    label: PANTRY_STORAGE_LOCATION_LABELS[location],
    scanTitle: `Scan ${PANTRY_STORAGE_LOCATION_LABELS[location].toLowerCase()}`,
    icon: PANTRY_STORAGE_SCAN_ICONS[location],
  }));
}

export const PANTRY_SCAN_TIP = {
  message:
    'Tip: For best results, scan one shelf at a time — hold the phone close, use good light, and keep labels facing the camera.',
  dismissStorageKey: 'mealprep.pantryScanTipDismissed',
  /** Show the tip again on review when at or below this many detections. */
  fewItemsThreshold: 3,
} as const;

/** Last selected location tab on the Pantry screen (`all` or a storage location). */
export const PANTRY_LOCATION_FILTER_STORAGE_KEY = 'mealprep.pantryLocationFilter';

export const PANTRY_LIST_COPY = {
  emptyFiltered: 'No items match your filters.',
  showAllFilters: 'Show all locations and categories',
  storageFilterLabel: 'Storage',
  allLocationsChipLabel: 'All',
  overflowMenuA11y: 'More pantry actions',
  useSoonHeading: 'Use soon',
} as const;

const LEGACY_FRIDGE_PATTERN = /\bfridge\b|\brefrigerator\b/i;
const LEGACY_SPICE_PATTERN = /\bspice[\s_-]?rack\b|\bspice_rack\b/i;

export function isPantryStorageLocation(value: string): value is PantryStorageLocation {
  return (PANTRY_STORAGE_LOCATIONS as readonly string[]).includes(value);
}

/** Map DB / legacy free-text values to canonical storage keys. Null and empty count as pantry. */
export function normalizePantryStorageLocation(raw: string | null | undefined): PantryStorageLocation {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'pantry') {
    return DEFAULT_PANTRY_STORAGE_LOCATION;
  }
  if (isPantryStorageLocation(trimmed)) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'fridge' || lower === 'refrigerator' || LEGACY_FRIDGE_PATTERN.test(trimmed)) {
    return 'fridge';
  }
  if (lower === 'spice_rack' || lower === 'spice rack' || LEGACY_SPICE_PATTERN.test(trimmed)) {
    return 'spice_rack';
  }
  return DEFAULT_PANTRY_STORAGE_LOCATION;
}

export function labelForPantryStorageLocation(location: PantryStorageLocation): string {
  return PANTRY_STORAGE_LOCATION_LABELS[location];
}

export function suggestStorageLocationForCategory(category: PantryCategory): PantryStorageLocation {
  switch (category) {
    case 'spices':
      return 'spice_rack';
    case 'dairy':
    case 'produce':
    case 'meats':
    case 'frozen':
      return 'fridge';
    default:
      return DEFAULT_PANTRY_STORAGE_LOCATION;
  }
}

function normalizeNameForStorage(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[demo sample\]/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameIncludesPhrase(normalizedName: string, phrase: string): boolean {
  return normalizedName.includes(phrase.toLowerCase());
}

function nameIncludesAnyPhrase(normalizedName: string, phrases: readonly string[]): boolean {
  for (const phrase of phrases) {
    if (nameIncludesPhrase(normalizedName, phrase)) return true;
  }
  return false;
}

/** Vision API storage string → canonical location (undefined if invalid / missing). */
export function parseVisionStorageField(raw: unknown): PantryStorageLocation | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'pantry' || trimmed === 'fridge' || trimmed === 'spice_rack' || trimmed === 'spice rack') {
    return normalizePantryStorageLocation(trimmed);
  }
  return undefined;
}

/**
 * Deterministic storage suggestion from item name + category.
 * Used when Gemini omits `storage` and for Re-sort on default-pantry rows.
 */
export function suggestStorageLocationForPantryItem(
  name: string,
  category: PantryCategory,
): PantryStorageLocation {
  const normalized = normalizeNameForStorage(name);

  if (category === 'spices' || nameIncludesAnyPhrase(normalized, SPICE_RACK_PHRASES)) {
    return 'spice_rack';
  }

  if (category === 'dairy' || category === 'meats' || category === 'frozen') {
    return 'fridge';
  }

  if (nameIncludesAnyPhrase(normalized, PANTRY_SHELF_STABLE_PHRASES)) {
    const needsFridgeAfterOpen =
      nameIncludesPhrase(normalized, 'opened') ||
      nameIncludesPhrase(normalized, 'refrigerate') ||
      nameIncludesPhrase(normalized, 'after opening');
    if (!needsFridgeAfterOpen) {
      return DEFAULT_PANTRY_STORAGE_LOCATION;
    }
  }

  if (nameIncludesAnyPhrase(normalized, FRIDGE_PHRASES)) {
    return 'fridge';
  }

  if (category === 'condiments') {
    return DEFAULT_PANTRY_STORAGE_LOCATION;
  }

  return suggestStorageLocationForCategory(category);
}

export interface PantryResortPreview {
  total: number;
  toFridge: number;
  toSpiceRack: number;
}

/** Count how many default-pantry rows would move under keyword mapping. */
export function previewResortFromDefaultPantry(items: readonly StoredItem[]): PantryResortPreview {
  let toFridge = 0;
  let toSpiceRack = 0;
  for (const item of items) {
    if (item.location !== DEFAULT_PANTRY_STORAGE_LOCATION) continue;
    const next = suggestStorageLocationForPantryItem(item.name, item.category);
    if (next === 'fridge') toFridge += 1;
    else if (next === 'spice_rack') toSpiceRack += 1;
  }
  return { total: toFridge + toSpiceRack, toFridge, toSpiceRack };
}

export function resortPantryItemIfDefault<T extends StoredItem>(item: T): T {
  if (item.location !== DEFAULT_PANTRY_STORAGE_LOCATION) return item;
  const next = suggestStorageLocationForPantryItem(item.name, item.category);
  if (next === item.location) return item;
  return { ...item, location: next, updatedAt: new Date().toISOString() };
}

export function pantryStorageLocationOptions(): Array<{ id: PantryStorageLocation; label: string }> {
  return PANTRY_STORAGE_LOCATIONS.map((id) => ({
    id,
    label: PANTRY_STORAGE_LOCATION_LABELS[id],
  }));
}

export function normalizePantryItemLocation<T extends { location: PantryStorageLocation | string }>(
  item: T,
): T & { location: PantryStorageLocation } {
  return {
    ...item,
    location: normalizePantryStorageLocation(String(item.location)),
  };
}

export function normalizePantryItemList<T extends { location: PantryStorageLocation | string }>(
  items: T[],
): Array<T & { location: PantryStorageLocation }> {
  return items.map((item) => normalizePantryItemLocation(item));
}
