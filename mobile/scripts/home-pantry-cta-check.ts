/**
 * Home Pantry CTA: copy, navigation target, and placement at top of Home scroll.
 * Run from mobile/: npm run test:home-pantry-cta
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ROUTES } from '../config/appRoutes';
import { RECIPES_COPY } from '../config/recipesCopy';

// Redesign (owner, 2026-10-11): Forky asks for one photo.
assert.equal(RECIPES_COPY.homePantryPrompt.heading, 'Show me your fridge.');
assert.equal(
  RECIPES_COPY.homePantryPrompt.description,
  "Take one photo. I list what's in it, then show you what you can cook tonight.",
);
assert.equal(RECIPES_COPY.homePantryPrompt.buttonLabel, 'Scan my fridge');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');

const ctaSource = fs.readFileSync(
  path.join(mobileRoot, 'components/home/HomePantryCta.tsx'),
  'utf8',
);
assert.match(ctaSource, /RECIPES_COPY\.homePantryPrompt/, 'cta should use home copy config');
assert.match(
  ctaSource,
  /router\.push\(APP_ROUTES\.pantry\)/,
  'button should navigate to pantry tab',
);
assert.match(ctaSource, /accessibilityRole="button"/);
assert.match(ctaSource, /accessibilityLabel=\{buttonLabel\}/);
assert.match(ctaSource, /useState\(false\)/, 'button should track pressed state for web feedback');
assert.match(ctaSource, /THEME\.tomatoDark/, 'button should darken while pressed');
assert.match(ctaSource, /scale: pressed \? 0\.96/, 'button should scale while pressed');
assert.ok(!ctaSource.includes('numberOfLines'), 'pantry description should wrap fully');

const homeSource = fs.readFileSync(path.join(mobileRoot, 'app/(tabs)/index.tsx'), 'utf8');
const scrollOpen = homeSource.indexOf('<ScrollView');
const pantryCtaIndex = homeSource.indexOf('<HomePantryCta');
const installBannerIndex = homeSource.indexOf('<InstallAppBanner');
const toolbarIndex = homeSource.indexOf('RECIPES_COPY.homeToolbarCard');
assert.ok(scrollOpen >= 0, 'home should use ScrollView');
assert.ok(pantryCtaIndex >= 0, 'home should render HomePantryCta');
assert.equal(
  homeSource.indexOf('<HomePantryCta', pantryCtaIndex + 1),
  -1,
  'home should render HomePantryCta once',
);
assert.ok(
  pantryCtaIndex > scrollOpen,
  'pantry CTA should be inside the home scroll surface',
);
assert.ok(
  pantryCtaIndex < installBannerIndex,
  'pantry CTA should be first scroll content (above install banner)',
);
assert.ok(
  pantryCtaIndex < toolbarIndex,
  'pantry CTA should render above the toolbar card',
);
assert.ok(
  toolbarIndex < homeSource.indexOf('CREATOR_RECIPES_COPY.creatorsSectionTitle'),
  'toolbar card should stay above catalog section bars',
);

assert.equal(APP_ROUTES.pantry, '/pantry');

console.log('home-pantry-cta-check: ok');
