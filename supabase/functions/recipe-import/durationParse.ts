/** Parse schema.org ISO 8601 duration (e.g. PT15M, PT1H30M) to whole minutes. */
export function parseIso8601DurationToMinutes(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Math.max(0, Number.parseInt(raw, 10));

  const match = raw.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
  );
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const total = days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60);
  return total > 0 ? total : null;
}

export function parseRecipeYieldToServings(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.round(value));
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = parseRecipeYieldToServings(entry);
      if (parsed != null) return parsed;
    }
    return null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) {
    const low = Number.parseInt(range[1], 10);
    const high = Number.parseInt(range[2], 10);
    if (!Number.isNaN(low) && !Number.isNaN(high)) {
      return Math.max(1, Math.round((low + high) / 2));
    }
  }
  const firstNum = text.match(/(\d+)/);
  if (firstNum) return Math.max(1, Number.parseInt(firstNum[1], 10));
  return null;
}
