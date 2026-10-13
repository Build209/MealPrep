import type { ViewStyle } from 'react-native';
import type { PackageShape } from './packages';

/**
 * The package drawings, copied from the old app (mobile/components/pantry/PantryShelves.tsx).
 * Each package is a few absolutely placed boxes on a 76 x 100 grid. DESIGN.md: the shelf
 * drawings are the one place colours outside the theme are allowed; they belong to the drawings.
 */

export const TILE_W = 76;
export const TILE_H = 100;

export const KRAFT = '#E2D8BD';
export const KRAFT_EDGE = '#CDBF98';
const WHITE_PACK = '#F6F7F2';
const WHITE_EDGE = '#C3CAC0';
const GLASS = '#EFE9D8';
const GLASS_EDGE = '#D3C9AC';
const DARK_GLASS = '#3B4A40';

function box(left: number, top: number, width: number, height: number, style: ViewStyle): ViewStyle {
  return { position: 'absolute', left, top, width, height, ...style };
}

export const SHAPE_PARTS: Record<Exclude<PackageShape, 'crate'>, ViewStyle[]> = {
  can: [
    box(6, 14, 64, 86, { borderRadius: 7, backgroundColor: '#C5CACD' }),
    box(13, 18, 8, 78, { backgroundColor: '#EEF1F2' }),
    box(6, 14, 64, 9, { borderRadius: 4, backgroundColor: '#E9ECEE' }),
    box(6, 91, 64, 9, { borderRadius: 4, backgroundColor: '#AEB4B8' }),
  ],
  jug: [
    box(26, 2, 20, 9, { borderRadius: 2, backgroundColor: '#1F4E79' }),
    box(24, 11, 24, 24, { backgroundColor: WHITE_PACK, borderWidth: 1.5, borderColor: WHITE_EDGE }),
    box(8, 28, 60, 72, {
      backgroundColor: WHITE_PACK,
      borderWidth: 1.5,
      borderColor: WHITE_EDGE,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 7,
      borderBottomRightRadius: 7,
    }),
    box(50, 33, 12, 13, { borderRadius: 4, backgroundColor: '#DDE3DA' }),
  ],
  carton: [
    box(28, 1, 20, 6, { borderRadius: 1.5, backgroundColor: WHITE_EDGE }),
    box(18, 6, 40, 22, {
      backgroundColor: '#E3E8E0',
      borderWidth: 1.5,
      borderColor: WHITE_EDGE,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    }),
    box(10, 26, 56, 74, { borderRadius: 3, backgroundColor: WHITE_PACK, borderWidth: 1.5, borderColor: WHITE_EDGE }),
  ],
  jar: [
    box(16, 12, 44, 11, { borderRadius: 3, backgroundColor: '#55655A' }),
    box(8, 23, 60, 77, { borderRadius: 11, backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_EDGE }),
  ],
  bottle: [
    box(31, 0, 14, 8, { borderRadius: 2, backgroundColor: '#1B2A20' }),
    box(32, 8, 12, 24, { backgroundColor: DARK_GLASS }),
    box(12, 26, 52, 74, {
      backgroundColor: DARK_GLASS,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderBottomLeftRadius: 6,
      borderBottomRightRadius: 6,
    }),
  ],
  box: [
    box(8, 6, 60, 94, { borderRadius: 4, backgroundColor: KRAFT, borderWidth: 1.5, borderColor: KRAFT_EDGE }),
    box(8, 17, 60, 1.5, { backgroundColor: KRAFT_EDGE }),
  ],
  // A pillow bag: flat sealed strips top and bottom, square shoulders, so it never reads as a jar.
  bag: [
    box(8, 12, 60, 88, { borderRadius: 3, backgroundColor: '#F1E9D3', borderWidth: 1.5, borderColor: '#D8CBA8' }),
    box(8, 12, 60, 9, { borderRadius: 2, backgroundColor: '#D8CBA8' }),
    box(8, 92, 60, 8, { borderRadius: 2, backgroundColor: '#D8CBA8' }),
    box(14, 15.5, 48, 1.5, { backgroundColor: '#C2B38B' }),
  ],
  tub: [
    box(4, 36, 68, 11, { borderRadius: 4, backgroundColor: '#E3E8E0', borderWidth: 1.5, borderColor: WHITE_EDGE }),
    box(9, 46, 58, 54, {
      backgroundColor: WHITE_PACK,
      borderWidth: 1.5,
      borderColor: WHITE_EDGE,
      borderBottomLeftRadius: 8,
      borderBottomRightRadius: 8,
    }),
  ],
  shaker: [
    box(18, 20, 40, 14, { borderRadius: 3, backgroundColor: DARK_GLASS }),
    box(10, 34, 56, 66, { borderRadius: 7, backgroundColor: GLASS, borderWidth: 1.5, borderColor: GLASS_EDGE }),
  ],
};

export function crateParts(fruit: string): ViewStyle[] {
  return [
    box(7, 33, 26, 26, { borderRadius: 13, backgroundColor: fruit }),
    box(25, 30, 26, 26, { borderRadius: 13, backgroundColor: fruit }),
    box(43, 33, 26, 26, { borderRadius: 13, backgroundColor: fruit }),
    box(6, 50, 64, 50, { borderRadius: 5, backgroundColor: KRAFT, borderWidth: 1.5, borderColor: KRAFT_EDGE }),
  ];
}
