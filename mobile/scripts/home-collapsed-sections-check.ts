/**
 * Home catalog sections: both folded by default. Creators come first and keep their avatar row on
 * screen while folded (owner, 2026-10-11, 6:51 pm: "creators first with the icons like before");
 * the curated recipes are just the name and an arrow, their chips showing once opened.
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
assert.equal(defaults.classic, false, 'recipes start folded: name and arrow only (owner, 2026-10-11)');
assert.equal(defaults.creators, false, 'creators should default collapsed');
assert.equal(RECIPES_TAB_SURFACE.defaultClassicExpanded, false);
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
// A folded section is just its name and arrow, unless it asks to keep its row on screen.
assert.match(
  sectionSource,
  /const showBubbleRow = \(expanded \|\| bubbleRowAlwaysVisible\) && Boolean\(bubbleRow\);/,
  'the chip row shows while the section is open, or always when the section asks for it',
);
assert.equal(
  (sectionSource.match(/showBubbleRow \? <View/g) ?? []).length,
  2,
  'the same rule applies above and below the heading',
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
const creatorsAt = homeSource.indexOf('RECIPES_TAB_SURFACE_COPY.creatorsSectionHeading}. ');
const classicAt = homeSource.indexOf('title={classicSectionToggleTitle}');
assert.ok(creatorsAt > 0 && classicAt > 0, 'both Home sections are present');
assert.ok(creatorsAt < classicAt, 'creators come before the curated recipes (owner, 2026-10-11)');
assert.match(
  homeSource.slice(creatorsAt, classicAt),
  /bubbleRowAlwaysVisible/,
  'the creator icons stay on screen while the section is folded',
);
assert.match(
  homeSource.slice(classicAt),
  /bubbleRowAlwaysVisible=\{showPantryCircles\}/,
  'pantry recipe circles stay on screen while folded; the category chips still wait (option B, owner 2026-10-11)',
);
assert.match(homeSource.slice(classicAt), /PantryRecipeCirclesRow/, 'From your pantry shows recipe circles');
assert.match(homeSource.slice(classicAt), /onOpen=\{openDetail\}/, 'tapping a circle opens that recipe');
assert.match(homeSource.slice(classicAt), /onSeeAll=\{\(\) => tabSurface\.setClassicExpanded\(true\)\}/, 'See all opens the section');
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
