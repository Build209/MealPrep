/**
 * Home catalog sections: pantry recipes open by default, creators collapsed; bubble rows always
 * rendered in section chrome.
 * Run from mobile/: npm run test:home-collapsed-sections
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES_TAB_SURFACE, RECIPES_TAB_SURFACE_COPY } from '../config/recipesTabSurface';
import { CREATOR_RECIPES_COPY } from '../config/creatorRecipes';
import { defaultRecipesTabSectionExpanded } from '../lib/recipesTab/sectionExpanded';

const defaults = defaultRecipesTabSectionExpanded();
assert.equal(defaults.classic, true, 'pantry recipes open by default (redesign, 2026-10-11)');
assert.equal(defaults.creators, false, 'creators should default collapsed');
assert.equal(RECIPES_TAB_SURFACE.defaultClassicExpanded, true);
assert.equal(RECIPES_TAB_SURFACE.defaultCreatorsExpanded, false);
assert.equal(
  RECIPES_TAB_SURFACE_COPY.classicSectionTitle,
  'See more curated recipes!',
  'classic bar title',
);
assert.equal(
  CREATOR_RECIPES_COPY.creatorsSectionTitle,
  'See more creator recipes!',
  'creators bar title',
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');
const sectionSource = fs.readFileSync(
  path.join(mobileRoot, 'components/recipes/RecipesTabCollapsibleSection.tsx'),
  'utf8',
);
assert.match(sectionSource, /bubbleRow/, 'collapsible section should accept bubbleRow');
assert.match(
  sectionSource,
  /\{bubbleRow \? <View/,
  'bubble row should render outside expanded body',
);
assert.doesNotMatch(
  sectionSource,
  /\{expanded \? <View className="mt-2">\{bubbleRow/,
  'bubble row must not be gated only on expanded',
);
assert.match(
  sectionSource,
  /accessibilityLabel=\{`\$\{title\}, \$\{expanded \? 'collapse' : 'expand'\}`\}/,
  'chevron toggle should label expand/collapse from section title',
);

const homeSource = fs.readFileSync(path.join(mobileRoot, 'app/(tabs)/index.tsx'), 'utf8');
assert.match(homeSource, /defaultRecipesTabSectionExpanded\(\)/, 'home should init the section defaults');
assert.match(homeSource, /bubbleRow=\{[\s\S]*CategoryAvatarsRow/, 'classic bubbles in bubbleRow');
assert.match(homeSource, /bubbleRow=\{[\s\S]*CreatorAvatarsRow/, 'creator bubbles in bubbleRow');
assert.doesNotMatch(
  homeSource,
  /readRecipesTabSectionExpanded/,
  'home should not restore expanded state from storage',
);
assert.doesNotMatch(
  homeSource,
  /RecipesEmptyState/,
  'home must not render the catalog empty-state card',
);
assert.doesNotMatch(
  homeSource,
  /showCatalogEmpty/,
  'home must not gate a catalog empty-state card',
);
assert.doesNotMatch(
  homeSource,
  /No recipes yet/,
  'home must not show the removed empty-state copy',
);
assert.doesNotMatch(homeSource, /Classic recipes/, 'home bar must not use the old classic title');
assert.doesNotMatch(homeSource, /From creators/, 'home bar must not use the old creators title');

console.log('home-collapsed-sections-check: ok');
