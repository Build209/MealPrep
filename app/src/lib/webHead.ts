/**
 * Search, share and install tags for the web build's index.html.
 *
 * The web build uses output "single", where Expo writes its own index.html (src/app/+html.tsx
 * only applies to static output). So `npm run export:web` runs scripts/web-head.ts after the
 * export, which puts these tags into dist/index.html with addWebHead().
 *
 * Wording is the owner's to change; keep it free of claims that need compliance review.
 */

export const SITE_URL = 'https://mealplanatic.app/';
export const SITE_NAME = 'MealPlanatic';
export const SITE_DESCRIPTION =
  'Plan meals from what you already have. Scan your pantry, keep a smart grocery list and find recipes.';
/** banana, from src/theme/tokens.ts */
export const THEME_COLOR = '#FFD12E';
export const OG_IMAGE = `${SITE_URL}og-image.png`;

const START = '<!-- web-head:start -->';
const END = '<!-- web-head:end -->';

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function webHeadTags(): string {
  const meta = (attr: 'name' | 'property', key: string, content: string) =>
    `<meta ${attr}="${key}" content="${esc(content)}" />`;
  return [
    START,
    meta('name', 'description', SITE_DESCRIPTION),
    meta('name', 'theme-color', THEME_COLOR),
    `<link rel="canonical" href="${SITE_URL}" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`,
    meta('name', 'apple-mobile-web-app-capable', 'yes'),
    meta('name', 'mobile-web-app-capable', 'yes'),
    meta('name', 'apple-mobile-web-app-title', SITE_NAME),
    meta('name', 'apple-mobile-web-app-status-bar-style', 'default'),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:title', SITE_NAME),
    meta('property', 'og:description', SITE_DESCRIPTION),
    meta('property', 'og:url', SITE_URL),
    meta('property', 'og:image', OG_IMAGE),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', `${SITE_NAME} logo on a yellow background`),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', SITE_NAME),
    meta('name', 'twitter:description', SITE_DESCRIPTION),
    meta('name', 'twitter:image', OG_IMAGE),
    END,
  ].join('\n');
}

/**
 * Returns the html with the tags placed just before </head>. Running it again replaces the
 * earlier block, and any description / theme-color / manifest / apple-touch-icon tag Expo
 * already wrote is dropped so there is only one of each.
 */
export function addWebHead(html: string): string {
  const close = html.search(/<\/head>/i);
  if (close < 0) throw new Error('index.html has no </head>');
  let out = html.replace(new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`), '');
  out = out
    .replace(/\s*<meta\s+name="(description|theme-color)"[^>]*>/gi, '')
    .replace(/\s*<link\s+rel="(manifest|apple-touch-icon|canonical)"[^>]*>/gi, '');
  return out.replace(/<\/head>/i, `\n${webHeadTags()}\n</head>`);
}
