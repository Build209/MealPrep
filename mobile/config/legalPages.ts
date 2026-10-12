import appJson from '../app.json';

/**
 * Public site origin. Hosted on GitHub Pages (repo: Build209/MealPrep) behind the
 * custom domain, so the constant keeps its historical name.
 */
export const GITHUB_PAGES_ORIGIN = 'https://mealplanatic.app';

function appBasePathFromConfig(): string {
  const baseUrl = (appJson.expo?.experiments as { baseUrl?: string } | undefined)?.baseUrl ?? '';
  const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

/** Published app path under the origin. Empty when the app is served from the domain root. */
export const GITHUB_PAGES_APP_PATH = appBasePathFromConfig();

export type LegalPageSlug = 'privacy' | 'terms';

export function githubPagesLegalUrl(slug: LegalPageSlug): string {
  return `${GITHUB_PAGES_ORIGIN}${GITHUB_PAGES_APP_PATH}/${slug}`;
}

/** In-app / static-export routes on GitHub Pages (no `.html` suffix). */
export function githubPagesAppRouteUrl(routePath: string): string {
  const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${GITHUB_PAGES_ORIGIN}${GITHUB_PAGES_APP_PATH}${normalized}`;
}

export const ACCOUNT_DELETION_WEB_PATH = '/delete-account';

export function githubPagesAccountDeletionUrl(): string {
  return githubPagesAppRouteUrl(ACCOUNT_DELETION_WEB_PATH);
}

/** Static HTML filenames copied from `public/` into `dist/` on web export. */
export const LEGAL_STATIC_HTML = {
  privacy: 'privacy.html',
  terms: 'terms.html',
} as const;
