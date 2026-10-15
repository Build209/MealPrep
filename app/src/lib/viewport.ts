/**
 * iPhone safe area on the web build. Safari reports env(safe-area-inset-*) as 0 unless the page's
 * viewport meta says viewport-fit=cover; without it, react-native-safe-area-context sees no home
 * indicator and the tab bar's labels can sit under it ("Add to Home Screen" standalone mode).
 * Expo's web export (output "single") writes its own <meta name="viewport">, so the app adds
 * viewport-fit=cover once at start-up, before the first render. No-op on iOS/Android builds.
 */
export const VIEWPORT_FALLBACK = 'width=device-width, initial-scale=1';

/** The viewport content with viewport-fit=cover added (an existing viewport-fit is replaced). */
export function withViewportFitCover(content: string | null | undefined): string {
  const parts = (content ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^viewport-fit\s*=/i.test(p));
  if (parts.length === 0) parts.push(...VIEWPORT_FALLBACK.split(', '));
  parts.push('viewport-fit=cover');
  return parts.join(', ');
}

export function enableSafeAreaViewport(): void {
  if (typeof document === 'undefined' || !document.head) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  const next = withViewportFitCover(meta.getAttribute('content'));
  if (meta.getAttribute('content') !== next) meta.setAttribute('content', next);
}
