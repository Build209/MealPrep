/**
 * First-time tour (owner's brief, 2026-10-10): the page greys out, Forky introduces himself and
 * the app, then points at one thing at a time with the button to press lit up. Easy to skip.
 */

export const TUTORIAL = {
  /**
   * On (owner, 2026-10-10): every new visitor gets the tour once, and "Take the tour" is in
   * everyone's account menu. Set false to hide it from everyone except admin accounts.
   */
  liveForEveryone: true,
  /** How often the lit-up area is re-measured while the tour is open (screens settle, lists load). */
  remeasureMs: 350,
  /** Space between the lit-up area and its outline. */
  spotlightPaddingPx: 6,
  /** Height of the bottom tab bar (`tabBarStyle.height` in app/(tabs)/_layout.tsx). */
  tabBarHeightPx: 68,
} as const;

/** Things the tour can light up. `forky` is worked out from his fixed place in the top bar. */
export type TutorialTargetId =
  | 'forky'
  | 'pantry-scan'
  | 'pantry-receipt'
  | 'home-search'
  | 'home-week-plan'
  | 'grocery-add'
  | 'stores-search';

export type TutorialStep = {
  id: string;
  /** Tab the step happens on. */
  route: '/' | '/pantry' | '/grocery' | '/stores';
  /** What is lit up; null greys the whole page and shows only Forky's card. */
  target: TutorialTargetId | null;
  title: string;
  message: string;
  /** A small sample list drawn inside the card (nothing real is added). */
  sample?: 'scan-review';
};

export const TUTORIAL_COPY = {
  skip: 'Skip tour',
  back: 'Back',
  next: 'Next',
  done: 'Done',
  progress: (step: number, total: number) => `${step} of ${total}`,
  accountTitle: 'Tour',
  accountBody: 'Forky walks you through the app, one button at a time.',
  accountButton: 'Take the tour',
  sampleListTitle: 'Found in your photo',
  sampleItems: ['Milk · fridge', 'Eggs · fridge', 'Rice · pantry'],
  sampleButton: 'Add to pantry',
  sampleNote: 'Example only',
  /** Last step, by what a tap on Forky does for this account. */
  askForkyOn: 'Tap me up here any time and ask me anything about your kitchen.',
  askForkyOff: 'When you see my think bubbles up here, tap me. I have something for you.',
} as const;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'hello',
    route: '/',
    target: 'forky',
    title: "Hi, I'm Forky McForkface",
    message: 'MealPlanatic plans dinner around the food you already have. Let me show you around. It takes about a minute.',
  },
  {
    id: 'scan',
    route: '/pantry',
    target: 'pantry-scan',
    title: 'Start with a photo',
    message: 'Tap here and take a picture of your fridge, then your pantry. I list what I can see.',
  },
  {
    id: 'review',
    route: '/pantry',
    target: null,
    title: 'Check my list',
    message: 'You get a list like this one. Fix anything I got wrong, then add it to your pantry or fridge.',
    sample: 'scan-review',
  },
  {
    id: 'receipt',
    route: '/pantry',
    target: 'pantry-receipt',
    title: 'Keep it current',
    message: 'After a shop, scan the receipt and I add what you bought. Receipts use the same monthly scans as shelf photos.',
  },
  {
    id: 'recipes',
    route: '/',
    target: 'home-search',
    title: 'Find dinner',
    message: 'Home is where the recipes are. Search here, and I show how much of each one you already have.',
  },
  {
    id: 'plan',
    route: '/',
    target: 'home-week-plan',
    title: 'Plan the week',
    message: 'Open your week here and drop meals onto the days you want them.',
  },
  {
    id: 'grocery',
    route: '/grocery',
    target: 'grocery-add',
    title: 'Your grocery list',
    message: 'What a planned meal still needs lands here. Add anything else yourself.',
  },
  {
    id: 'stores',
    route: '/stores',
    target: 'stores-search',
    title: 'Your stores',
    message: 'Find the stores near you and open their weekly ads.',
  },
  {
    id: 'ask',
    route: '/',
    target: 'forky',
    title: "That's the tour",
    // Replaced at run time by TUTORIAL_COPY.askForkyOn / askForkyOff.
    message: '',
  },
] as const;
