/**
 * Words on Home (owner, 2026-10-15: Ask Forky at the top, three counters, then a slot for later).
 * All NEW wording (not about price, renewal or cancelling). The Ask Forky lines Home shows are
 * ASK_FORKY_COPY's (src/forky/copy.ts), word for word, and the promo slot only uses approved
 * plans wording (src/plans/copy.ts).
 */
export const HOME_COPY = {
  title: 'Home',
  /**
   * The recipes counter's name. Owner may rename it ("need clever name here"): change this one line.
   * It matches the leaf sticker on recipe cards, which counts the same thing.
   */
  readyToCook: 'Ready to cook',
  pantryItems: 'Pantry items',
  groceryItems: 'On grocery list',
  /** Screen readers: "Ready to cook: 3. Opens Recipes." */
  counterA11y: (label: string, value: string, tab: string) => `${label}: ${value}. Opens ${tab}.`,
  loading: 'Loading',
  unknown: 'Not loaded',
  /** Home's Send button, named for screen readers so it is not confused with the chat's own Send. */
  sendA11y: 'Send to Forky',
  /** Home's question box, named for screen readers (the chat screen's box is "Your question for Forky"). */
  inputA11y: 'Ask Forky a question',
  /**
   * The weekly-deals row (owner, 2026-10-16). No savings claims, no company names beyond what a link
   * opens. Alternatives for the owner: "Check your local stores for this week's deals" and
   * "Peek at this week's ads from your stores".
   */
  dealsTitle: "Check your stores for deals",
  dealsHelper: 'Tap a store to open its weekly ad.',
  /** Screen readers: "Weekly ad: Safeway", or "Weekly ad (third-party): Safeway" when the ad is on another company's site. */
  dealsStoreA11y: (name: string, thirdParty: boolean) => `${thirdParty ? 'Weekly ad (third-party)' : 'Weekly ad'}: ${name}`,
} as const;

/** Tab names the counters open (the tab labels in src/app/(tabs)/_layout.tsx). */
export const TAB_TITLES = {
  home: 'Home',
  pantry: 'Pantry',
  recipes: 'Recipes',
  grocery: 'Grocery',
} as const;
