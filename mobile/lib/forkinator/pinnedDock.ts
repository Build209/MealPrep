/**
 * Forky's fixed place in the app's top bar (owner's decision, 2026-10-10): he stands where the
 * round logo used to be, smaller than the old floating mascot, and no longer moves or drags.
 * His feet hang a little below the bar. Text clouds open under him.
 */

/** Pinned size: same proportions as the artwork (about 0.365 wide to tall). */
export const FORKINATOR_PINNED_WIDTH_PX = 26;
export const FORKINATOR_PINNED_HEIGHT_PX = 72;
/** From the left edge of the app column and the top of the bar (the bar is 64px tall). */
export const FORKINATOR_PINNED_LEFT_PX = 16;
export const FORKINATOR_PINNED_TOP_PX = 5;
/** Height of the tab screens' top bar. His feet hang below it; nothing else of his may. */
export const APP_TOP_BAR_HEIGHT_PX = 64;
/** The app's content column is centred and never wider than this (Tailwind `max-w-lg`). */
export const APP_COLUMN_MAX_WIDTH_PX = 512;
/** A cloud folds away by itself after this long; the think bubbles stay as a "tap me" hint. */
export const FORKINATOR_CLOUD_AUTO_COLLAPSE_MS = 9000;
/** Tap target around Forky and his think bubbles (at least 44px wide). */
export const FORKINATOR_PINNED_HIT_PAD_LEFT_PX = 10;
export const FORKINATOR_PINNED_HIT_WIDTH_PX = 62;
export const FORKINATOR_PINNED_HIT_HEIGHT_PX = 82;

/** Empty space on each side of the app column on a wide screen. */
export function appColumnSideInset(screenWidth: number): number {
  return Math.max(0, (screenWidth - APP_COLUMN_MAX_WIDTH_PX) / 2);
}

export function pinnedForkinatorPosition(screenWidth: number, insetLeft = 0): { x: number; y: number } {
  return {
    x: insetLeft + appColumnSideInset(screenWidth) + FORKINATOR_PINNED_LEFT_PX,
    y: FORKINATOR_PINNED_TOP_PX,
  };
}

const TAB_ROUTE_NAMES = new Set(['', 'index', '(tabs)', 'grocery', 'pantry', 'recipes', 'stores', 'profile', 'admin']);

/**
 * Forky lives in the tab screens' top bar. Full-screen pages (Smart Shop, recipe discovery,
 * delete account, pantry staples) have their own top row with a back button, so he stays off them.
 */
export function isForkinatorTabRoute(pathname: string): boolean {
  const segments = pathname.split('?')[0].split('/').filter(Boolean);
  if (segments.length === 0) return true;
  const withoutGroup = segments.filter((segment) => segment !== '(tabs)');
  if (withoutGroup.length === 0) return true;
  return withoutGroup.length === 1 && TAB_ROUTE_NAMES.has(withoutGroup[0]);
}

export type ForkinatorThinkDot = { left: number; top: number; size: number };

/**
 * Two small bubbles beside Forky: "I have something, tap me". They sit in the bottom corner of
 * the top bar, under the wordmark, and never below the bar: the page scrolls underneath it, so
 * a bubble hanging lower would float over recipe text.
 */
export function forkinatorThinkDots(position: { x: number; y: number }): ForkinatorThinkDot[] {
  const right = position.x + FORKINATOR_PINNED_WIDTH_PX;
  const barBottom = position.y - FORKINATOR_PINNED_TOP_PX + APP_TOP_BAR_HEIGHT_PX;
  return [
    { left: right + 1, top: barBottom - 18, size: 7 },
    { left: right + 9, top: barBottom - 12, size: 10 },
  ];
}

export type PinnedForkinatorTap =
  /** A cloud folded away and its think bubbles are showing: open it again. */
  | 'reopenCloud'
  /** On Home with nothing else to say and no chat: open the "Can't decide?" cloud. */
  | 'openForkInRoadCloud'
  /** Anything else: the usual tap (dismiss what is open, open Ask Forky where it is on). */
  | 'default';

export function resolvePinnedForkinatorTap(input: {
  promptShowing: boolean;
  cloudOpen: boolean;
  forkInRoadPromptVisible: boolean;
  forkInRoadExpanded: boolean;
  askForkyAvailable: boolean;
}): PinnedForkinatorTap {
  if (input.promptShowing && !input.cloudOpen) return 'reopenCloud';
  if (
    !input.promptShowing &&
    input.forkInRoadPromptVisible &&
    !input.forkInRoadExpanded &&
    !input.askForkyAvailable
  ) {
    return 'openForkInRoadCloud';
  }
  return 'default';
}
