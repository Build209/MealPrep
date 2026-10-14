/**
 * Remembers, for this app session only, that the account was just deleted, so sign-in can say so.
 * Kept in memory rather than in the address: signing out also makes the tabs send people to
 * sign-in, and either navigation may arrive first. Cleared once sign-in has shown it and the person
 * starts typing or signs in again; a reload forgets it.
 */
let justDeleted = false;

export function markAccountDeleted(): void {
  justDeleted = true;
}

export function accountWasJustDeleted(): boolean {
  return justDeleted;
}

export function clearAccountDeleted(): void {
  justDeleted = false;
}
