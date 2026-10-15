/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addWebHead, SITE_DESCRIPTION, THEME_COLOR } from '../src/lib/webHead';
import { colors } from '../src/theme/tokens';

const sample = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="theme-color" content="#ffffff">
<title>MealPlanatic</title></head><body><div id="root"></div></body></html>`;

const count = (html: string, needle: string) => html.split(needle).length - 1;

test('adds description, share, install and theme tags inside <head>', () => {
  const out = addWebHead(sample);
  const head = out.slice(0, out.indexOf('</head>'));
  assert.ok(head.includes(`<meta name="description" content="${SITE_DESCRIPTION}" />`));
  assert.ok(head.includes('<link rel="manifest" href="/manifest.webmanifest" />'));
  assert.ok(head.includes('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />'));
  assert.ok(head.includes('<meta property="og:url" content="https://mealplanatic.app/" />'));
  assert.ok(head.includes('<meta property="og:image" content="https://mealplanatic.app/og-image.png" />'));
  assert.ok(head.includes('<meta name="twitter:card" content="summary_large_image" />'));
  assert.ok(head.includes('<meta name="apple-mobile-web-app-capable" content="yes" />'));
  assert.equal(count(out, 'name="theme-color"'), 1, 'Expo theme-color replaced, not duplicated');
  assert.ok(out.includes(`<meta name="theme-color" content="${THEME_COLOR}" />`));
  assert.ok(out.includes('<div id="root"></div>'));
});

test('running twice gives the same page', () => {
  const once = addWebHead(sample);
  assert.equal(addWebHead(once), once);
});

test('theme colour is the banana token', () => {
  assert.equal(THEME_COLOR.toLowerCase(), colors.banana.toLowerCase());
});

test('manifest points at icons that exist', () => {
  const pub = join(__dirname, '..', 'public');
  const manifest = JSON.parse(readFileSync(join(pub, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color.toLowerCase(), colors.banana.toLowerCase());
  assert.equal(manifest.background_color.toLowerCase(), colors.paper.toLowerCase());
  for (const icon of manifest.icons) assert.ok(existsSync(join(pub, icon.src)), icon.src);
  for (const f of ['og-image.png', 'icons/apple-touch-icon.png', 'robots.txt', 'sitemap.xml']) {
    assert.ok(existsSync(join(pub, f)), f);
  }
});

test('robots.txt blocks nothing', () => {
  const robots = readFileSync(join(__dirname, '..', 'public', 'robots.txt'), 'utf8');
  assert.ok(!/^Disallow:\s*\S/m.test(robots));
  assert.ok(robots.includes('Sitemap: https://mealplanatic.app/sitemap.xml'));
});
