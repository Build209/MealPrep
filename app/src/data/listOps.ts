/**
 * Pure list changes for optimistic updates. No React, no TanStack, no network: each
 * function takes a list and returns a new one, so they are easy to test.
 *
 * A ListChange knows how to apply itself and how to undo itself. Undo is targeted:
 * it only touches the rows this change touched, so a failed change never wipes out
 * another change made in the meantime (see `rollback`).
 */

export type Identified = { id: string };

export type ListChange<T extends Identified> = {
  /** The new list with this change applied. Never mutates the input. */
  apply(list: readonly T[]): T[];
  /** Undo only this change on `current`, using the rows saved in `snapshot`. */
  revert(current: readonly T[], snapshot: readonly T[]): T[];
};

/** Change some fields of one row. Unknown id: the list is returned unchanged. */
export function updateItem<T extends Identified>(id: string, patch: Partial<Omit<T, 'id'>>): ListChange<T> {
  return {
    apply: (list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    revert: (current, snapshot) => {
      const before = snapshot.find((item) => item.id === id);
      if (!before) return [...current];
      return current.map((item) => (item.id === id ? before : item));
    },
  };
}

/** Remove one row. Undo puts it back where it was. */
export function removeItem<T extends Identified>(id: string): ListChange<T> {
  return {
    apply: (list) => list.filter((item) => item.id !== id),
    revert: (current, snapshot) => {
      const index = snapshot.findIndex((item) => item.id === id);
      const before = snapshot[index];
      if (index < 0 || !before) return [...current];
      if (current.some((item) => item.id === id)) return [...current];
      const next = [...current];
      next.splice(Math.min(index, next.length), 0, before);
      return next;
    },
  };
}

/** Add a row with a temporary id (see tempId). Undo removes it. */
export function addItem<T extends Identified>(item: T, position: 'start' | 'end' = 'end'): ListChange<T> {
  return {
    apply: (list) => (position === 'start' ? [item, ...list] : [...list, item]),
    revert: (current) => current.filter((row) => row.id !== item.id),
  };
}

/**
 * Puts the server's copy of a row in place of the old one (or of a temporary
 * placeholder, when `replaceId` is the temporary id). Rows on screen always end up
 * being what the server returned.
 */
export function replaceItem<T extends Identified>(list: readonly T[], serverRow: T, replaceId: string = serverRow.id): T[] {
  let found = false;
  const next = list.map((item) => {
    if (item.id !== replaceId) return item;
    found = true;
    return serverRow;
  });
  if (!found) return next;
  // If the server row was already present under its real id (a refetch got there first), keep one copy.
  if (replaceId !== serverRow.id) {
    let seen = false;
    return next.filter((item) => {
      if (item.id !== serverRow.id) return true;
      if (seen) return false;
      seen = true;
      return true;
    });
  }
  return next;
}

/**
 * Undo a failed change.
 * - Nothing else changed the list since this change was applied (`current` is still
 *   the very list `apply` produced): restore the snapshot exactly.
 * - Something else changed it (another change, or a refetch): undo only this change's rows.
 */
export function rollback<T extends Identified>(
  current: readonly T[] | undefined,
  snapshot: readonly T[],
  applied: readonly T[],
  change: ListChange<T>,
): T[] {
  if (current === undefined || current === applied) return [...snapshot];
  return change.revert(current, snapshot);
}

const TEMP_PREFIX = 'temp-';
let tempCounter = 0;

/** A placeholder id for a row the server has not created yet. Replaced by the real row on success. */
export function tempId(): string {
  tempCounter += 1;
  return `${TEMP_PREFIX}${Date.now().toString(36)}-${tempCounter}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}
