/**
 * Allow only absolute http/https URLs for user-facing links (blocks javascript:, data:, etc.).
 * Keep in sync with lib/recipeImport/safeHttpUrl.ts.
 */

export type SafeHttpUrl = string & { readonly __safeHttpUrlBrand: unique symbol };

const BLOCKED_SCHEME_PREFIXES = ['javascript:', 'data:', 'vbscript:', 'file:'];

export function isAllowedHttpUrlString(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  for (const blocked of BLOCKED_SCHEME_PREFIXES) {
    if (lower.startsWith(blocked)) return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return false;
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeHttpUrl(url: string | null | undefined): SafeHttpUrl | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed || !isAllowedHttpUrlString(trimmed)) return null;
  return trimmed as SafeHttpUrl;
}

export function resolveAndSanitizeHttpUrl(
  url: string | null | undefined,
  pageUrl: string,
): SafeHttpUrl | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const absolute = new URL(trimmed, pageUrl).href;
    return sanitizeHttpUrl(absolute);
  } catch {
    return null;
  }
}
