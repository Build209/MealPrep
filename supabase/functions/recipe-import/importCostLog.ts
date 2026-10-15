// One numbers-only log line per answered Gemini call, so import cost can be read from the
// function logs (same idea as the "pantry-vision: scan ..." line). Never put URLs, user ids
// or recipe text in it.

export type ImportLogKind = 'video' | 'link' | 'text' | 'photo' | 'screenshot';

export interface ImportLogLabel {
  kind: ImportLogKind;
  /** youtube | tiktok | instagram | facebook | reddit | web | photo | upload */
  source: string;
}

export interface GeminiUsageCounts {
  tokensIn: number;
  tokensOut: number;
  thinking: number;
}

export function readGeminiUsage(raw: unknown): GeminiUsageCounts {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  return {
    tokensIn: count(row.promptTokenCount),
    tokensOut: count(row.candidatesTokenCount),
    thinking: count(row.thoughtsTokenCount),
  };
}

/** Keeps a label value to a short safe token (no spaces, no URL characters). */
function safeToken(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return cleaned.slice(0, 48) || 'unknown';
}

/**
 * outcome: ok = usable recipe JSON; rejected = answered but failed the schema check;
 * failed = answered (and billed) but empty or unparseable.
 */
export function formatImportCostLine(entry: {
  outcome: 'ok' | 'rejected' | 'failed';
  label: ImportLogLabel;
  ms: number;
  usage: GeminiUsageCounts;
  model: string;
}): string {
  return (
    `recipe-import: extract ${entry.outcome}` +
    ` kind=${safeToken(entry.label.kind)} source=${safeToken(entry.label.source)}` +
    ` ms=${Math.max(0, Math.round(entry.ms))}` +
    ` tokensIn=${entry.usage.tokensIn} tokensOut=${entry.usage.tokensOut} thinking=${entry.usage.thinking}` +
    ` model=${safeToken(entry.model)}`
  );
}
