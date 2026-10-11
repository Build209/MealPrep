import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import { APP_BRAND } from '../config/appBrand';
import { THEME } from '../config/appConfig';
import { getWebBasePath, webAssetPath } from '../lib/webBasePath';

/**
 * Sticker aisle look: Atkinson Hyperlegible Next for everything read, Bagel Fat One for titles and
 * stickers. Both are served from our own site so no outside font service is called. App text has
 * no font of its own, so it takes the reading face; icons set their own icon font and are left
 * alone (the :not() below), as is anything else that names a font, and the `font-display` class,
 * which the rule would otherwise outrank.
 */
const READING_FONT_FILE = '/fonts/AtkinsonHyperlegibleNext-Variable-Latin.ttf';
const DISPLAY_FONT_FILE = '/fonts/BagelFatOne-Latin.ttf';

function fontCss(): string {
  const reading = webAssetPath(READING_FONT_FILE);
  const display = webAssetPath(DISPLAY_FONT_FILE);
  const stack = "'Atkinson Hyperlegible Next', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  return [
    `@font-face{font-family:'Atkinson Hyperlegible Next';src:url(${reading}) format('truetype');font-weight:200 800;font-style:normal;font-display:swap}`,
    `@font-face{font-family:'Bagel Fat One';src:url(${display}) format('truetype');font-weight:400;font-style:normal;font-display:swap}`,
    `html,body{font-family:${stack}}`,
    `[dir]:not([class*="r-fontFamily-"]):not([style*="font-family"]):not(.font-display),input,textarea,button{font-family:${stack}}`,
  ].join('');
}

/**
 * Pulling down at the top of a screen must not reload the app (Android Chrome's pull-to-refresh):
 * a reload throws away a scan in progress, an open recipe and anything half typed. Screens that
 * want a refresh have their own button. Found in live testing on an Android phone, 2026-10-10.
 */
const NO_PULL_TO_REFRESH_CSS = 'html,body{overscroll-behavior-y:contain}';

export default function Root({ children }: { children: React.ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();

  const manifestHref = webAssetPath('/manifest.webmanifest');
  const appleIconHref = webAssetPath('/icons/apple-touch-icon.png');

  return (
    <html lang="en" suppressHydrationWarning {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        {/* Without a title the browser tab, history, bookmarks and shared links showed a bare address. */}
        <title>{`${APP_BRAND.name}: pantry, grocery list and recipes`}</title>
        <meta name="description" content={APP_BRAND.pwaDescription} />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content={THEME.banana} />
        <meta name="application-name" content={APP_BRAND.shortName} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={APP_BRAND.shortName} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="meal-prep-base" content={getWebBasePath() || '/'} />
        <link rel="manifest" href={manifestHref} />
        <link rel="apple-touch-icon" href={appleIconHref} />
        <ScrollViewStyleReset />
        <link rel="preload" href={webAssetPath(READING_FONT_FILE)} as="font" type="font/ttf" crossOrigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: fontCss() }} />
        <style dangerouslySetInnerHTML={{ __html: NO_PULL_TO_REFRESH_CSS }} />
        {headNodes}
      </head>
      <body suppressHydrationWarning {...bodyAttributes}>
        {children}
        {bodyNodes}
        <script src={webAssetPath('/pwa-register.js')} defer />
      </body>
    </html>
  );
}
