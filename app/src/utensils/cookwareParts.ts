import type { ViewStyle } from 'react-native';
import type { GearCategory } from './gear';

/**
 * Cookware drawings, in the same style as the pantry packages (src/pantry/shelves/packageParts.ts):
 * a few flat, absolutely placed boxes on a 76 x 100 grid, no shadows, no logos, no brand shapes.
 * DESIGN.md: the shelf drawings are the one place colours outside the theme are allowed.
 * Keyed by the `equipment.slug` values in the database; a slug with no drawing falls back to a
 * plain pot for its category (see `cookwareParts`). tests/utensils-cookware.test.ts keeps the
 * seeded slugs and the drawings in step.
 */

export const COOKWARE_W = 76;
export const COOKWARE_H = 100;

const STEEL = '#C5CACD';
const STEEL_LIGHT = '#E9ECEE';
const STEEL_DARK = '#9AA1A6';
const IRON = '#3A3F44';
const IRON_LIGHT = '#575D63';
const ENAMEL_RED = '#B5432F';
const ENAMEL_RED_DARK = '#8E3223';
// A neutral blue-grey, so the mixer does not echo any one maker's colour.
const MIXER = '#8FB0BE';
const MIXER_DARK = '#6C8F9E';
const WHITE_APP = '#F6F7F2';
const WHITE_EDGE = '#C3CAC0';
const GLASS = '#DCE8EA';
const GLASS_EDGE = '#B5C7CB';
const WOOD = '#C9A56B';
const WOOD_DARK = '#A9854D';
const BLACK = '#2B2F33';
const BUTTON_RED = '#C9431F';

function box(left: number, top: number, width: number, height: number, style: ViewStyle = {}): ViewStyle {
  return { position: 'absolute', left, top, width, height, ...style };
}

/** A filled circle or ring. */
function disc(left: number, top: number, size: number, style: ViewStyle = {}): ViewStyle {
  return box(left, top, size, size, { borderRadius: size / 2, ...style });
}

export const COOKWARE_PARTS: Readonly<Record<string, ViewStyle[]>> = {
  // ---- heat
  oven: [
    box(6, 10, 64, 84, { borderRadius: 6, backgroundColor: STEEL, borderWidth: 1.5, borderColor: STEEL_DARK }),
    disc(14, 16, 8, { backgroundColor: IRON }),
    disc(34, 16, 8, { backgroundColor: IRON }),
    disc(54, 16, 8, { backgroundColor: IRON }),
    box(13, 34, 50, 50, { borderRadius: 4, backgroundColor: BLACK }),
    box(18, 40, 40, 5, { borderRadius: 2, backgroundColor: IRON_LIGHT }),
    box(13, 30, 50, 4, { borderRadius: 2, backgroundColor: STEEL_DARK }),
  ],
  stovetop: [
    box(4, 48, 68, 34, { borderRadius: 5, backgroundColor: IRON }),
    disc(10, 52, 26, { borderWidth: 3, borderColor: IRON_LIGHT }),
    disc(40, 52, 26, { borderWidth: 3, borderColor: IRON_LIGHT }),
    disc(18, 60, 10, { backgroundColor: ENAMEL_RED }),
    box(4, 82, 68, 8, { borderRadius: 3, backgroundColor: STEEL }),
    disc(14, 84, 4, { backgroundColor: IRON }),
    disc(36, 84, 4, { backgroundColor: IRON }),
    disc(58, 84, 4, { backgroundColor: IRON }),
  ],
  microwave: [
    box(4, 26, 68, 56, { borderRadius: 6, backgroundColor: WHITE_APP, borderWidth: 1.5, borderColor: WHITE_EDGE }),
    box(10, 32, 42, 44, { borderRadius: 4, backgroundColor: BLACK }),
    box(57, 34, 10, 6, { borderRadius: 1.5, backgroundColor: STEEL_DARK }),
    box(57, 46, 10, 6, { borderRadius: 1.5, backgroundColor: STEEL_DARK }),
    box(57, 58, 10, 6, { borderRadius: 1.5, backgroundColor: STEEL_DARK }),
    box(10, 82, 8, 4, { backgroundColor: IRON }),
    box(58, 82, 8, 4, { backgroundColor: IRON }),
  ],
  air_fryer: [
    box(12, 8, 52, 84, { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: BLACK }),
    disc(32, 14, 12, { backgroundColor: IRON_LIGHT }),
    box(18, 52, 40, 8, { borderRadius: 3, backgroundColor: IRON_LIGHT }),
    box(18, 64, 40, 20, { borderRadius: 4, backgroundColor: IRON }),
    box(26, 70, 24, 4, { borderRadius: 2, backgroundColor: IRON_LIGHT }),
  ],
  grill: [
    box(10, 14, 56, 32, { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: IRON }),
    box(8, 44, 60, 6, { borderRadius: 3, backgroundColor: STEEL_DARK }),
    box(10, 48, 56, 22, { borderBottomLeftRadius: 28, borderBottomRightRadius: 28, backgroundColor: IRON }),
    box(34, 8, 8, 8, { borderRadius: 3, backgroundColor: STEEL_DARK }),
    box(22, 68, 4, 30, { backgroundColor: IRON_LIGHT, transform: [{ rotate: '10deg' }] }),
    box(50, 68, 4, 30, { backgroundColor: IRON_LIGHT, transform: [{ rotate: '-10deg' }] }),
  ],
  smoker: [
    box(34, 0, 8, 12, { backgroundColor: IRON_LIGHT }),
    box(16, 8, 44, 24, { borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: ENAMEL_RED_DARK }),
    box(16, 30, 44, 60, { borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: ENAMEL_RED_DARK }),
    box(22, 46, 32, 24, { borderRadius: 3, backgroundColor: BLACK }),
    box(24, 90, 5, 10, { backgroundColor: IRON }),
    box(47, 90, 5, 10, { backgroundColor: IRON }),
  ],
  slow_cooker: [
    box(34, 12, 8, 8, { borderRadius: 3, backgroundColor: IRON }),
    box(10, 20, 56, 16, { borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_EDGE }),
    box(8, 36, 60, 54, { borderRadius: 16, backgroundColor: ENAMEL_RED }),
    box(2, 46, 8, 8, { borderRadius: 3, backgroundColor: IRON }),
    box(66, 46, 8, 8, { borderRadius: 3, backgroundColor: IRON }),
    disc(32, 66, 12, { backgroundColor: STEEL_LIGHT }),
  ],
  pressure_cooker: [
    box(26, 8, 24, 8, { borderRadius: 3, backgroundColor: IRON }),
    box(10, 16, 56, 14, { borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: IRON_LIGHT }),
    box(12, 30, 52, 62, { borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: STEEL, borderWidth: 1.5, borderColor: STEEL_DARK }),
    box(2, 24, 14, 6, { borderRadius: 3, backgroundColor: IRON }),
    box(60, 24, 14, 6, { borderRadius: 3, backgroundColor: IRON }),
    box(24, 46, 28, 20, { borderRadius: 4, backgroundColor: BLACK }),
    disc(34, 52, 8, { backgroundColor: BUTTON_RED }),
  ],
  toaster_oven: [
    box(4, 32, 68, 54, { borderRadius: 6, backgroundColor: STEEL, borderWidth: 1.5, borderColor: STEEL_DARK }),
    box(10, 40, 40, 38, { borderRadius: 4, backgroundColor: BLACK }),
    disc(56, 42, 10, { backgroundColor: IRON }),
    disc(56, 58, 10, { backgroundColor: IRON }),
    box(10, 86, 8, 5, { backgroundColor: IRON }),
    box(58, 86, 8, 5, { backgroundColor: IRON }),
  ],
  rice_cooker: [
    box(10, 14, 56, 28, { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: WHITE_APP, borderWidth: 1.5, borderColor: WHITE_EDGE }),
    box(8, 40, 60, 52, { borderRadius: 14, backgroundColor: WHITE_APP, borderWidth: 1.5, borderColor: WHITE_EDGE }),
    box(28, 36, 20, 8, { borderRadius: 3, backgroundColor: STEEL_DARK }),
    disc(33, 64, 10, { backgroundColor: BUTTON_RED }),
    box(30, 6, 16, 8, { borderRadius: 3, backgroundColor: STEEL_DARK }),
  ],

  // ---- pots and pans
  skillet: [
    box(4, 48, 56, 4, { borderRadius: 2, backgroundColor: IRON_LIGHT }),
    box(6, 50, 52, 22, { borderBottomLeftRadius: 20, borderBottomRightRadius: 20, backgroundColor: IRON }),
    box(56, 54, 20, 7, { borderRadius: 3, backgroundColor: IRON }),
    box(14, 54, 10, 3, { borderRadius: 1.5, backgroundColor: IRON_LIGHT }),
  ],
  saucepan: [
    box(12, 38, 42, 4, { borderRadius: 2, backgroundColor: STEEL_DARK }),
    box(14, 40, 38, 44, { borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: STEEL, borderWidth: 1.5, borderColor: STEEL_DARK }),
    box(52, 44, 24, 7, { borderRadius: 3, backgroundColor: IRON }),
    box(20, 46, 6, 30, { borderRadius: 3, backgroundColor: STEEL_LIGHT }),
  ],
  stockpot: [
    box(34, 8, 8, 6, { borderRadius: 3, backgroundColor: IRON }),
    box(8, 14, 60, 8, { borderRadius: 3, backgroundColor: STEEL_DARK }),
    box(10, 22, 56, 70, { borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: STEEL, borderWidth: 1.5, borderColor: STEEL_DARK }),
    box(2, 30, 10, 7, { borderRadius: 3, backgroundColor: IRON }),
    box(64, 30, 10, 7, { borderRadius: 3, backgroundColor: IRON }),
    box(18, 30, 6, 54, { borderRadius: 3, backgroundColor: STEEL_LIGHT }),
  ],
  dutch_oven: [
    box(32, 20, 12, 10, { borderRadius: 5, backgroundColor: IRON }),
    box(6, 30, 64, 16, { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: ENAMEL_RED }),
    box(6, 44, 64, 46, { borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: ENAMEL_RED }),
    box(6, 43, 64, 3, { backgroundColor: ENAMEL_RED_DARK }),
    box(0, 54, 9, 8, { borderRadius: 3, backgroundColor: IRON }),
    box(67, 54, 9, 8, { borderRadius: 3, backgroundColor: IRON }),
  ],
  sheet_pan: [
    box(2, 52, 72, 18, { borderRadius: 3, backgroundColor: STEEL_DARK }),
    box(5, 55, 66, 11, { borderRadius: 2, backgroundColor: STEEL }),
    box(10, 58, 24, 3, { borderRadius: 1.5, backgroundColor: STEEL_LIGHT }),
  ],
  baking_dish: [
    box(8, 48, 60, 38, { borderRadius: 8, backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_EDGE }),
    box(14, 54, 48, 26, { borderRadius: 5, backgroundColor: WHITE_APP }),
    box(2, 52, 9, 8, { borderRadius: 3, backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_EDGE }),
    box(65, 52, 9, 8, { borderRadius: 3, backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_EDGE }),
  ],
  wok: [
    box(4, 42, 68, 4, { borderRadius: 2, backgroundColor: IRON_LIGHT }),
    box(4, 44, 68, 38, { borderBottomLeftRadius: 34, borderBottomRightRadius: 34, backgroundColor: IRON }),
    box(60, 40, 20, 6, { borderRadius: 3, backgroundColor: WOOD_DARK, transform: [{ rotate: '-14deg' }] }),
    box(22, 82, 32, 5, { borderRadius: 2, backgroundColor: IRON_LIGHT }),
  ],
  griddle: [
    box(4, 54, 68, 14, { borderRadius: 3, backgroundColor: IRON }),
    box(10, 58, 56, 2, { backgroundColor: IRON_LIGHT }),
    box(10, 63, 56, 2, { backgroundColor: IRON_LIGHT }),
    box(0, 58, 8, 6, { borderRadius: 3, backgroundColor: IRON_LIGHT }),
    box(68, 58, 8, 6, { borderRadius: 3, backgroundColor: IRON_LIGHT }),
  ],

  // ---- tools
  chef_knife: [
    box(28, 4, 18, 60, { borderTopLeftRadius: 16, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: STEEL }),
    box(28, 4, 5, 60, { borderTopLeftRadius: 16, backgroundColor: STEEL_LIGHT }),
    box(30, 62, 14, 34, { borderRadius: 6, backgroundColor: BLACK }),
    disc(35, 68, 4, { backgroundColor: STEEL_DARK }),
    disc(35, 82, 4, { backgroundColor: STEEL_DARK }),
  ],
  cutting_board: [
    box(10, 14, 56, 78, { borderRadius: 8, backgroundColor: WOOD, borderWidth: 1.5, borderColor: WOOD_DARK }),
    box(32, 20, 12, 7, { borderRadius: 4, backgroundColor: WOOD_DARK }),
    box(18, 40, 40, 2, { backgroundColor: WOOD_DARK }),
    box(18, 56, 40, 2, { backgroundColor: WOOD_DARK }),
  ],
  whisk: [
    box(22, 4, 32, 58, { borderRadius: 16, borderWidth: 2, borderColor: STEEL_DARK }),
    box(30, 4, 16, 58, { borderRadius: 8, borderWidth: 2, borderColor: STEEL_DARK }),
    box(37, 4, 2, 58, { backgroundColor: STEEL_DARK }),
    box(30, 58, 16, 8, { borderRadius: 3, backgroundColor: IRON_LIGHT }),
    box(32, 64, 12, 32, { borderRadius: 6, backgroundColor: IRON }),
  ],
  tongs: [
    box(26, 6, 8, 88, { borderRadius: 4, backgroundColor: STEEL, transform: [{ rotate: '7deg' }] }),
    box(42, 6, 8, 88, { borderRadius: 4, backgroundColor: STEEL_DARK, transform: [{ rotate: '-7deg' }] }),
    box(31, 82, 14, 12, { borderRadius: 4, backgroundColor: IRON }),
  ],
  blender: [
    box(16, 4, 44, 7, { borderRadius: 3, backgroundColor: IRON }),
    box(18, 10, 40, 54, { borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_EDGE }),
    box(24, 40, 28, 18, { borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: '#F2D9B0' }),
    box(12, 64, 52, 32, { borderRadius: 7, backgroundColor: IRON }),
    disc(33, 74, 10, { backgroundColor: BUTTON_RED }),
  ],
  food_processor: [
    box(28, 12, 20, 24, { borderRadius: 3, backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_EDGE }),
    box(10, 34, 56, 10, { borderRadius: 4, backgroundColor: IRON_LIGHT }),
    box(12, 42, 52, 34, { borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_EDGE }),
    box(8, 76, 60, 20, { borderRadius: 6, backgroundColor: IRON }),
    disc(33, 82, 8, { backgroundColor: BUTTON_RED }),
  ],
  stand_mixer: [
    box(6, 12, 62, 24, { borderTopLeftRadius: 24, borderTopRightRadius: 12, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: MIXER }),
    box(6, 12, 10, 18, { borderRadius: 4, backgroundColor: MIXER_DARK }),
    box(12, 34, 14, 48, { backgroundColor: MIXER }),
    box(6, 80, 64, 16, { borderRadius: 6, backgroundColor: MIXER }),
    box(32, 56, 36, 28, { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: STEEL, borderWidth: 1.5, borderColor: STEEL_DARK }),
    box(46, 36, 4, 28, { borderRadius: 2, backgroundColor: STEEL_DARK }),
  ],

  // ---- at the table
  fork: [
    box(26, 4, 5, 28, { borderRadius: 2.5, backgroundColor: STEEL }),
    box(35.5, 4, 5, 28, { borderRadius: 2.5, backgroundColor: STEEL }),
    box(45, 4, 5, 28, { borderRadius: 2.5, backgroundColor: STEEL }),
    box(26, 28, 24, 14, { borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: STEEL }),
    box(34, 40, 8, 56, { borderRadius: 4, backgroundColor: STEEL }),
  ],
  chopsticks: [
    box(28, 2, 5, 96, { borderRadius: 2.5, backgroundColor: WOOD, transform: [{ rotate: '8deg' }] }),
    box(43, 2, 5, 96, { borderRadius: 2.5, backgroundColor: WOOD_DARK, transform: [{ rotate: '-4deg' }] }),
  ],
  bowls: [
    box(6, 42, 64, 6, { borderRadius: 3, backgroundColor: STEEL_LIGHT, borderWidth: 1.5, borderColor: STEEL }),
    box(8, 46, 60, 38, { borderBottomLeftRadius: 30, borderBottomRightRadius: 30, backgroundColor: '#DCE6F2', borderWidth: 1.5, borderColor: '#B4C5DB' }),
    box(24, 84, 28, 5, { borderRadius: 2, backgroundColor: '#B4C5DB' }),
  ],
};

/** A plain drawing per category, used when a slug has no drawing of its own yet (new gear added in the database). */
const FALLBACK_SLUG: Readonly<Record<GearCategory, string>> = {
  heat: 'microwave',
  pots_pans: 'stockpot',
  tools: 'whisk',
  eating: 'bowls',
};

export function cookwareParts(slug: string, category: GearCategory): ViewStyle[] {
  return COOKWARE_PARTS[slug] ?? COOKWARE_PARTS[FALLBACK_SLUG[category]] ?? [];
}
