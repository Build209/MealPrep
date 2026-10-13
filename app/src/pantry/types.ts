import type { PantryItem } from '../data/rows';
import { normalizePantryCategory, type PantryCategory } from '../kitchen/categories';
import { normalizePantryStorageLocation, type PantryStorageLocation } from '../kitchen/storage';

/**
 * A pantry row as the pantry screens read it: the stored free-text category and location
 * mapped to the known values (an empty or old location counts as the pantry). Derived on
 * every render from the query data; never stored.
 */
export type ShelvedItem = Omit<PantryItem, 'category' | 'location'> & {
  category: PantryCategory;
  location: PantryStorageLocation;
};

export function toShelvedItem(item: PantryItem): ShelvedItem {
  return {
    ...item,
    category: normalizePantryCategory(item.category),
    location: normalizePantryStorageLocation(item.location),
  };
}
