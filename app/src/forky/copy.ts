/**
 * Wording for Ask Forky, ported from the old app (mobile/config/askForky.ts). Limits mirror the
 * live ask-forky function, which is what enforces them.
 */
export const ASK_FORKY_LIMITS = {
  questionChars: 500,
  historyTurns: 4,
  pantryItems: 60,
  recipes: 8,
} as const;

export const ASK_FORKY_COPY = {
  title: 'Ask Forky',
  close: 'Close',
  intro: "Ask me what to cook, how to use something up, or what to swap. I can see what's in your pantry.",
  /**
   * Always on screen, word for word from the old app: says it is an AI (California chatbot
   * disclosure, compliance register item 17) and carries the terms' verify line (rule 9).
   */
  aiNotice: 'Forky is an AI helper and can be wrong. Always check allergens and food safety yourself before you cook.',
  /** Under any answer about allergens, nutrition or food safety (compliance rule 9). */
  safetyNote: 'Check labels and a trusted source for allergies, nutrition and food safety.',
  placeholder: 'Ask about dinner, your pantry or a swap',
  inputLabel: 'Your question for Forky',
  send: 'Send',
  thinking: 'Forky is thinking…',
  quickReplies: ['What can I make tonight?', 'What should I use up first?', 'Quick dinner, few dishes'],
  openRecipe: 'Open recipe',
  limitFree: "That's all the free questions for this month. They refill on the 1st, and a paid plan includes more.",
  limitPlus: "You've used this month's questions. They refill on the 1st.",
  seePlans: 'See plans',
  tooLong: 'Keep questions under 500 characters.',
  featureOff: 'Ask Forky is not available yet.',
  notConfigured: 'Ask Forky is not set up yet.',
  unavailable: 'Ask Forky is unavailable right now. Please try again later.',
  rateLimit: 'Too many questions at once. Wait a moment and try again.',
  signedOut: 'Sign in again to ask Forky.',
  network: "Couldn't reach Forky. Check your connection and try again.",
  timeout: 'Forky took too long to answer. Please try again.',
  genericError: 'Forky could not answer. Please try again.',
} as const;

/**
 * "3 questions left this month", "1 question left this month", "No questions left this month".
 * Says "questions" like the live app, the Terms and the Plans screen (compliance review row 7.21).
 * The "this month" ending is NEW wording, pending compliance sign-off.
 */
export function questionsLeftText(remaining: number): string {
  if (remaining <= 0) return 'No questions left this month';
  return remaining === 1 ? '1 question left this month' : `${remaining} questions left this month`;
}
