/** Grocery list UI copy — screens import from here. */
export const GROCERY_COPY = {
  listTitle: 'Grocery list',
  toBuySection: 'To buy',
  inCartSection: 'In cart',
  addItem: 'Add item',
  /** Approved design: the pill field under the heading that opens the add-item sheet. */
  addItemField: 'Add an item',
  /** "Your usuals": items bought regularly whose usual time has nearly come (learning step 2). */
  usualsTitle: 'Your usuals',
  usualsBlurb: 'You buy these regularly, and it is about time again.',
  usualsEvery: (days: number) =>
    days % 7 === 0 && days <= 56
      ? days === 7
        ? 'About every week'
        : `About every ${days / 7} weeks`
      : `About every ${days} days`,
  usualsAdd: 'Add',
  usualsAddA11y: (name: string) => `Add ${name} to your grocery list`,
  usualsHideA11y: (name: string) => `Stop suggesting ${name}`,
  refresh: 'Refresh',
  clearCheckedItems: 'Clear checked items',
  clearCheckedTitle: 'Clear checked items',
  clearCheckedMessage: (count: number) => `Remove ${count} item(s) from your list?`,
  clear: 'Clear',
  cancel: 'Cancel',
  removeItem: 'Remove',
  removeItemTitle: 'Remove item',
  removeItemMessage: (name: string) => `Remove “${name}” from your list?`,
  undoRemoved: (name: string) => `Removed ${name}`,
  undoCleared: (count: number) => `Cleared ${count} item(s)`,
  allSetHint: 'All set — clear checked items or plan another meal.',
  nameRequiredTitle: 'Name required',
  nameRequiredMessage: 'Enter an item name.',
  quantityTitle: 'Quantity',
  quantityMessage: 'Enter a valid quantity.',
  addItemModalTitle: 'Add item',
  itemNamePlaceholder: 'Item name',
  qtyPlaceholder: 'Qty',
  unitPlaceholder: 'Unit',
  aisleLabel: 'Aisle',
  addToList: 'Add to list',
  shopThisList: (count: number) => `Shop this list (${count})`,
  /** Primary CTA from grocery tab → Smart Shop (prefilled open items + saved location). */
  findStoresForList: (count: number) => `Find stores for this list (${count})`,
  /** Approved design: grocery tab button that opens Smart Shop. No savings claims or figures here. */
  findStoresNearMe: 'Find stores near me',
  addedMissingSingle: (name: string) => `Added ${name} to your grocery list`,
  addedMissingPlural: (count: number) => `Added ${count} missing items to your grocery list`,
  alreadyOnGroceryList: 'Those missing items are already on your grocery list',
  nothingMissingOnGroceryList: 'Nothing missing — your pantry already has these ingredients',
  addMissingUnavailable: 'Could not add items yet. Try again in a moment.',
  viewGroceryListAction: 'View list',
  plannedMealsLine: (count: number) =>
    count === 1
      ? '1 planned meal · only buy what recipes still need'
      : `${count} planned meals · only buy what recipes still need`,
  toBuyInCartLine: (open: number, checked: number) => `${open} to buy · ${checked} in cart`,
  combineList: 'Combine',
  /** Approved design: label for the combine toggle (the combined list is ordered by aisle). */
  sortByAisle: 'Sort by aisle',
  combinedForMeals: (hint: string) => hint,
} as const;
