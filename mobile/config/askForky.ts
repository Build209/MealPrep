/** Wording for Ask Forky, the AI chat. Limits here mirror the server, which is what enforces them. */
export const ASK_FORKY_LIMITS = {
  questionChars: 500,
  historyTurns: 4,
  pantryItems: 60,
  recipes: 8,
  /** Household profile (learning step 4): how many usual items and recently cooked meals are sent. */
  usualItems: 8,
  cookedRecently: 5,
  cookedWithinDays: 30,
} as const;

export const ASK_FORKY_COPY = {
  openButton: 'Ask Forky',
  title: 'Ask Forky',
  close: 'Close',
  intro: "Ask me what to cook, how to use something up, or what to swap. I can see what's in your pantry.",
  /** Always on screen: says it is an AI, and carries the terms' verify line (compliance rules 9 and 17). */
  aiNotice:
    'Forky is an AI helper and can be wrong. Always check allergens and food safety yourself before you cook.',
  safetyNote: 'Check labels and a trusted source for allergies, nutrition and food safety.',
  placeholder: 'Ask about dinner, your pantry or a swap',
  send: 'Send',
  thinking: 'Forky is thinking…',
  quickReplies: ['What can I make tonight?', 'What should I use up first?', 'Quick dinner, few dishes'],
  helpMePick: 'Help me pick instead',
  openRecipe: 'Open recipe',
  remaining: (left: number) => (left === 1 ? '1 question left' : `${left} questions left`),
  signInTitle: 'Sign in to ask Forky',
  signInBody: 'Forky needs your pantry to answer, so he works with a free account.',
  signIn: 'Sign in',
  limitFree: "That's all the free questions. Plus includes Ask Forky every month.",
  limitPlus: "You've used this month's questions. They refill on the 1st.",
  seePlus: 'See Plus',
  tooLong: 'Keep questions under 500 characters.',
  featureOff: 'Ask Forky is not available yet.',
  notConfigured: 'Ask Forky is not set up yet.',
  offline: "You're offline. Forky needs a connection to answer.",
  genericError: 'Forky could not answer. Please try again.',
} as const;
