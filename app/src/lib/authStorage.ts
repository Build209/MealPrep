/**
 * Where supabase-js keeps the signed-in session. Web: nothing here, so supabase-js uses the
 * browser's localStorage (its default). Phones use authStorage.native.ts instead (Metro picks the
 * .native file for iOS and Android builds).
 */
export const authStorage = undefined;

/** Web: supabase-js refreshes the session itself while the page is open. */
export function watchAppState(_start: () => void, _stop: () => void): void {}
