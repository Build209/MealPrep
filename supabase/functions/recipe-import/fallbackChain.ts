export type ImportFallbackStep = 'youtube_confirm' | 'video_upload' | 'screenshot' | 'paste_caption';

export interface ImportFallbackContext {
  sourceType: string;
  hasCaption: boolean;
  youtubeSuggestionAvailable: boolean;
}

/** Ordered fallback options shown when primary import cannot produce a recipe. */
export function orderImportFallbackSteps(context: ImportFallbackContext): ImportFallbackStep[] {
  const steps: ImportFallbackStep[] = [];
  if (context.youtubeSuggestionAvailable) {
    steps.push('youtube_confirm');
  }
  steps.push('video_upload', 'screenshot');
  if (
    (context.sourceType === 'instagram' || context.sourceType === 'facebook') &&
    !context.hasCaption
  ) {
    steps.push('paste_caption');
  }
  return steps;
}
