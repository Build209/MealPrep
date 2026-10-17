/**
 * Words for "Your usuals" (Grocery tab) and its Account control. All NEW: not through compliance
 * yet (request doc: "Compliance request - Usual items 2026-10-17"). No savings or money claims;
 * nothing says the app "knows" or "learns" you.
 */
export const USUALS_COPY = {
  title: 'Your usuals',
  explain: 'Things you buy regularly that may be due again.',
  rhythm: (days: number) => `You usually buy this about every ${days} days.`,
  add: (name: string) => `Add ${name} to your list`,
  addLabel: 'Add',
  notNow: 'Not now',
  notNowA11y: (name: string) => `Not now for ${name}`,
  hide: 'Hide',
  hideA11y: (name: string) => `Hide ${name} from your usuals`,
  addFailed: "Couldn't add that to your list. Check your connection and try again.",
  settingFailed: "Couldn't save that. Check your connection and try again.",

  accountTitle: 'Your usuals',
  accountExplain:
    'When you tick an item off your grocery list, MealPlanatic keeps the item name and the day. It uses that to suggest items you buy regularly. Only you can see it.',
  forget: 'Forget my usuals',
  forgetting: 'Forgetting…',
  forgotten: 'Done. Your usuals were cleared.',
  forgetFailed: "Couldn't clear your usuals. Check your connection and try again.",
} as const;
