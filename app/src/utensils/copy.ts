/**
 * Words for the cookware picker (Pantry tab > Cookware). NEW wording, not yet reviewed by
 * compliance: see "Compliance request - Utensils picker 2026-10-18". Cookware names come from the
 * database in plain text (no brand names, no logos). Nothing here promises a result: no recipe is
 * tagged yet, so the picker only saves the answers.
 */
export const GEAR_COPY = {
  pantryPill: 'Cookware',
  cardTitle: 'Your cookware',
  cardExplainNone: "Tell us what's in your kitchen. Matching recipes to your cookware is coming.",
  cardExplainSet: (n: number) => (n === 1 ? 'You picked 1 item.' : `You picked ${n} items.`),
  cardStorage: "Your picks are saved to your account and aren't shared with other users.",
  start: 'Pick my cookware',
  edit: 'Change my cookware',
  loadFailed: "Couldn't load the cookware list. Check your connection and try again.",

  stepOf: (i: number, n: number) => `Step ${i} of ${n}`,
  shelfTitle: { heat: 'Heat', pots_pans: 'Pots & pans', tools: 'Tools & table' } as const,
  shelfPrompt: {
    heat: 'What do you cook with?',
    pots_pans: 'Which pots and pans do you have?',
    tools: 'What else is in your kitchen?',
  } as const,
  tapToPick: 'Tap everything you have. Skip anything you are not sure about.',
  next: 'Next',
  back: 'Back',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  skip: 'Skip for now',
  saved: 'Saved.',
  saveFailed: "Couldn't save that. Check your connection and try again.",
  onlyMakeable: 'Only what I can make',
  onlyMakeableHint: 'Hides recipes that need cookware you did not pick.',
  couldWorkWith: (gear: string) => `Could work with your ${gear}`,
  needs: (gear: string) => `Needs: ${gear}`,
  tileA11y: (name: string, on: boolean) => `${name}, ${on ? 'picked' : 'not picked'}`,
} as const;
