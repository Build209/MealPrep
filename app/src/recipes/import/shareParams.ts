import { extractUrlFromText } from './urlInput';

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim();

/**
 * What a shared link fills the import box with, as the old share target (shareTargetImportRoute):
 * the link, else the first link in the shared text, else the text.
 */
export function initialImportText(params: { url?: string | string[]; text?: string | string[] }): string {
  const url = first(params.url);
  if (url) return url.slice(0, 2000);
  const text = first(params.text);
  return (extractUrlFromText(text) ?? text).slice(0, 4000);
}
