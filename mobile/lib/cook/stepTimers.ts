/**
 * Reads a cooking time out of a recipe step ("simmer 15 minutes") so cook mode can
 * suggest a timer. It only suggests: the user always taps Start.
 *
 * Rules:
 * - First time found in the step wins ("sear 6 minutes per side" gives 6 min).
 * - A range ("10 to 12 minutes", "10-12 minutes") uses the LOWER end, so the cook
 *   checks early and can add a minute, instead of overcooking.
 * - Hours, minutes and seconds are understood. "Overnight", "until golden" and
 *   times without a number give no timer.
 * - Times under 10 seconds or over 24 hours are ignored as noise.
 */

export interface StepDuration {
  seconds: number;
  /** Short label for a chip, for example "15 min" or "1 hr 30 min". */
  label: string;
}

export interface StepTimerSuggestion extends StepDuration {
  stepIndex: number;
}

const MIN_SECONDS = 10;
const MAX_SECONDS = 24 * 60 * 60;

const FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
};

const VALUE =
  '(?:\\d+(?:\\.\\d+)?\\s?[½¼¾⅓⅔⅛]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[½¼¾⅓⅔⅛])';
const UNIT = '(hours?|hrs?|minutes?|mins?|seconds?|secs?)';

const TIME_PATTERN = new RegExp(
  `(${VALUE})(?:\\s*(?:-|–|—|to)\\s*(${VALUE}))?\\s*-?\\s*${UNIT}\\b`,
  'i',
);

function parseValue(token: string): number | null {
  const t = token.trim();
  if (FRACTIONS[t] !== undefined) return FRACTIONS[t];

  const mixedUnicode = t.match(/^(\d+)\s?([½¼¾⅓⅔⅛])$/);
  if (mixedUnicode) return Number(mixedUnicode[1]) + FRACTIONS[mixedUnicode[2]];

  const mixedSlash = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedSlash) {
    const denominator = Number(mixedSlash[3]);
    if (denominator === 0) return null;
    return Number(mixedSlash[1]) + Number(mixedSlash[2]) / denominator;
  }

  const slash = t.match(/^(\d+)\/(\d+)$/);
  if (slash) {
    const denominator = Number(slash[2]);
    if (denominator === 0) return null;
    return Number(slash[1]) / denominator;
  }

  const plain = Number(t);
  return Number.isFinite(plain) ? plain : null;
}

function unitSeconds(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith('h')) return 3600;
  if (u.startsWith('m')) return 60;
  return 1;
}

export function formatDurationLabel(totalSeconds: number): string {
  const total = Math.round(totalSeconds);
  if (total < 60) return `${total} sec`;
  if (total < 3600) {
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} sec`;
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export function detectStepDuration(stepText: string): StepDuration | null {
  const match = TIME_PATTERN.exec(stepText);
  if (!match) return null;

  const first = parseValue(match[1]);
  if (first === null) return null;
  const second = match[2] ? parseValue(match[2]) : null;
  const amount = second !== null ? Math.min(first, second) : first;

  let seconds = Math.round(amount * unitSeconds(match[3]));

  // "1 hour 15 minutes": add the minutes that directly follow a plain number of hours.
  if (second === null && unitSeconds(match[3]) === 3600) {
    const rest = stepText.slice(match.index + match[0].length);
    const extra = /^\s*(?:and\s+)?(\d+)\s*(?:minutes?|mins?)\b/i.exec(rest);
    if (extra) seconds += Number(extra[1]) * 60;
  }

  if (!(seconds >= MIN_SECONDS && seconds <= MAX_SECONDS)) return null;

  return { seconds, label: formatDurationLabel(seconds) };
}

export function detectStepTimers(steps: readonly string[]): StepTimerSuggestion[] {
  const out: StepTimerSuggestion[] = [];
  steps.forEach((text, stepIndex) => {
    const found = detectStepDuration(text);
    if (found) out.push({ stepIndex, ...found });
  });
  return out;
}
