/**
 * Makes the phone's back button (or back swipe) close the sheet that is open, instead of leaving
 * the app. Found in live testing on Android, 2026-10-10: with a recipe open, Back closed the app.
 *
 * How: when a sheet opens, one extra entry is added to the browser's history for the same page.
 * Back then pops that entry (the page does not change) and we close the top sheet. When a sheet
 * is closed another way (its X, a button), we take our entry back out so Back is not left with a
 * dead step. The entry keeps the router's own history state, so the router sees no change.
 */

export type SheetBackEnv = {
  getState: () => unknown;
  pushState: (state: unknown) => void;
  back: () => void;
  onPop: (listener: () => void) => void;
};

type OpenSheet = { id: number; close: () => void; closedByBack: boolean };

const SHEET_STATE_KEY = 'mpSheet';

function sheetIdOf(state: unknown): number | null {
  if (state && typeof state === 'object' && SHEET_STATE_KEY in state) {
    const id = (state as Record<string, unknown>)[SHEET_STATE_KEY];
    return typeof id === 'number' ? id : null;
  }
  return null;
}

export function createSheetBackStack(env: SheetBackEnv) {
  const open: OpenSheet[] = [];
  let nextId = 1;
  /** Pops we caused ourselves by removing a sheet's entry; they must not close anything. */
  let ownPops = 0;
  let listening = false;

  function handlePop(): void {
    if (ownPops > 0) {
      ownPops -= 1;
      return;
    }
    const top = open.pop();
    if (!top) return;
    top.closedByBack = true;
    top.close();
  }

  /** Call when a sheet opens; call the returned function when it closes or goes away. */
  function register(close: () => void): () => void {
    if (!listening) {
      listening = true;
      env.onPop(handlePop);
    }
    const sheet: OpenSheet = { id: nextId, close, closedByBack: false };
    nextId += 1;
    open.push(sheet);
    const current = env.getState();
    env.pushState({ ...(current && typeof current === 'object' ? current : {}), [SHEET_STATE_KEY]: sheet.id });

    return () => {
      const index = open.indexOf(sheet);
      if (index >= 0) open.splice(index, 1);
      if (sheet.closedByBack) return;
      // Closed by its own button. Remove our history entry only while it is still the current
      // one: if the app has moved to another page since (a button in the sheet opened a recipe),
      // going back would undo that move.
      if (sheetIdOf(env.getState()) === sheet.id) {
        ownPops += 1;
        env.back();
      }
    };
  }

  return { register, openCount: () => open.length };
}

let browserStack: ReturnType<typeof createSheetBackStack> | null = null;

/** The stack for the real browser; null where there is no browser history (native, server render). */
export function sheetBackStack(): ReturnType<typeof createSheetBackStack> | null {
  if (browserStack) return browserStack;
  if (typeof window === 'undefined' || !window.history || typeof window.addEventListener !== 'function') return null;
  browserStack = createSheetBackStack({
    getState: () => window.history.state,
    pushState: (state) => window.history.pushState(state, ''),
    back: () => window.history.back(),
    onPop: (listener) => window.addEventListener('popstate', listener),
  });
  return browserStack;
}
