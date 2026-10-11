import { memo } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { THEME } from '../../config/appConfig';
import {
  PACKAGE_LABEL_BOX,
  SHELF_VIEW_COPY,
  type PackageShape,
  type PantryShelf,
  type ShelfTile,
} from '../../lib/pantry/shelfView';
import type { PantryItem } from '../../types/mealprep';
import { Sticker } from '../ui/Sticker';

/** The package drawing is laid out on a 76 x 100 grid, as in the mockup. */
const TILE_W = 76;
const TILE_H = 100;
/** Matches the screen's `px-5`, so shelves can run edge to edge and still line up with the page. */
const PAGE_GUTTER = 20;

/** Each package stands in a column this wide; the column's name tag hangs under the board. */
const COLUMN_W = 96;
const COLUMN_GAP = 8;
/** Content never grows past the app's phone-width column. */
const MAX_PAGE_W = 512;
const KRAFT = '#E2D8BD';
const KRAFT_EDGE = '#CDBF98';
const WHITE_PACK = '#F6F7F2';
const WHITE_EDGE = '#C3CAC0';
const GLASS = '#EFE9D8';
const GLASS_EDGE = '#D3C9AC';
const DARK_GLASS = '#3B4A40';

function box(left: number, top: number, width: number, height: number, style: ViewStyle): ViewStyle {
  return { position: 'absolute', left, top, width, height, ...style };
}

const SHAPE_PARTS: Record<Exclude<PackageShape, 'crate'>, ViewStyle[]> = {
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

function crateParts(fruit: string): ViewStyle[] {
  return [
    box(7, 33, 26, 26, { borderRadius: 13, backgroundColor: fruit }),
    box(25, 30, 26, 26, { borderRadius: 13, backgroundColor: fruit }),
    box(43, 33, 26, 26, { borderRadius: 13, backgroundColor: fruit }),
    box(6, 50, 64, 50, { borderRadius: 5, backgroundColor: KRAFT, borderWidth: 1.5, borderColor: KRAFT_EDGE }),
  ];
}

const PackageTile = memo(function PackageTile({
  tile,
  onPress,
}: {
  tile: ShelfTile;
  onPress: (item: PantryItem) => void;
}) {
  const parts = tile.shape === 'crate' ? crateParts(tile.produceColor) : SHAPE_PARTS[tile.shape];
  const [top, bottom, inset] = PACKAGE_LABEL_BOX[tile.shape];
  return (
    <Pressable
      onPress={() => onPress(tile.item)}
      accessibilityRole="button"
      accessibilityLabel={tile.a11yLabel}
      style={({ pressed }) => ({ width: TILE_W, height: TILE_H, opacity: pressed ? 0.8 : 1 })}
    >
      {parts.map((style, index) => (
        <View key={index} style={style} />
      ))}
      <View
        style={{
          position: 'absolute',
          top,
          bottom,
          left: inset,
          right: inset,
          paddingHorizontal: 3,
          paddingVertical: 2,
          borderRadius: 3,
          backgroundColor: tile.labelColor,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* The name is on the shelf-edge tag under the board, where it can be read in full. */}
      </View>
      {tile.quantityBadge ? (
        <Sticker
          label={tile.quantityBadge}
          tone="ink"
          size="sm"
          tilt={8}
          style={{ position: 'absolute', top: -2, left: -6 }}
        />
      ) : null}
      {tile.daysBadge ? (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 0,
            minWidth: 24,
            height: 20,
            paddingHorizontal: 5,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 999,
            backgroundColor: THEME.warning,
          }}
        >
          <Text style={{ fontSize: 12, lineHeight: 14, fontWeight: '800', color: THEME.onWarning }}>{tile.daysBadge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

/** The name tag that hangs from the shelf edge under a package, like a price tag in a store. */
function ShelfTag({ tile, onPress }: { tile: ShelfTile; onPress: (item: PantryItem) => void }) {
  return (
    <Pressable
      onPress={() => onPress(tile.item)}
      aria-hidden
      tabIndex={-1}
      style={({ pressed }) => ({
        width: COLUMN_W,
        minHeight: 44,
        paddingHorizontal: 5,
        paddingTop: 5,
        paddingBottom: 7,
        borderBottomLeftRadius: 9,
        borderBottomRightRadius: 9,
        backgroundColor: THEME.banana,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        numberOfLines={3}
        style={{ fontSize: 13, lineHeight: 15, fontWeight: '700', color: THEME.onBanana, textAlign: 'center' }}
      >
        {tile.item.name}
      </Text>
      {tile.sizeLabel ? (
        <Text
          numberOfLines={1}
          style={{ marginTop: 1, fontSize: 13, lineHeight: 15, color: THEME.onBanana, textAlign: 'center' }}
        >
          {tile.sizeLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ShelfRow({
  shelf,
  onPressItem,
  onSeeAll,
}: {
  shelf: PantryShelf;
  onPressItem: (item: PantryItem) => void;
  onSeeAll: (shelf: PantryShelf) => void;
}) {
  const { width } = useWindowDimensions();
  // A short shelf still gets a board that reaches the right edge of the screen.
  const boardMinWidth = Math.min(width, MAX_PAGE_W) - PAGE_GUTTER;
  return (
    <View className="mb-3">
      <View className="min-h-[44px] flex-row items-center gap-2">
        <Text className="text-[17px] font-extrabold leading-[22px] text-ink" accessibilityRole="header">
          {shelf.name}
        </Text>
        <Text className="text-sm leading-5 text-muted">{shelf.count}</Text>
        <Pressable
          onPress={() => onSeeAll(shelf)}
          accessibilityRole="button"
          accessibilityLabel={`${SHELF_VIEW_COPY.seeAll}: ${shelf.name}`}
          className="ml-auto min-h-[44px] justify-center pl-4"
        >
          <Text className="text-sm font-bold text-primary">{SHELF_VIEW_COPY.seeAll}</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -PAGE_GUTTER }}
        contentContainerStyle={{ paddingLeft: PAGE_GUTTER }}
      >
        <View style={{ minWidth: boardMinWidth }}>
          <View style={{ flexDirection: 'row', gap: COLUMN_GAP, alignItems: 'flex-end', paddingTop: 6 }}>
            {shelf.tiles.map((tile) => (
              <View key={tile.item.id} style={{ width: COLUMN_W, alignItems: 'center' }}>
                <PackageTile tile={tile} onPress={onPressItem} />
              </View>
            ))}
            {shelf.moreCount > 0 ? (
              <Pressable
                onPress={() => onSeeAll(shelf)}
                accessibilityRole="button"
                accessibilityLabel={`${SHELF_VIEW_COPY.moreTile(shelf.moreCount)}: ${shelf.name}`}
                style={{ width: COLUMN_W, height: TILE_H, paddingTop: 14, paddingHorizontal: 8 }}
              >
                <View
                  className="flex-1 items-center justify-center rounded-[10px] border-dashed border-muted"
                  style={{ borderWidth: 1.5 }}
                >
                  <Text className="text-center text-sm font-bold text-primary">
                    {SHELF_VIEW_COPY.moreTile(shelf.moreCount)}
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
          <View
            style={{
              height: 8,
              marginLeft: -8,
              borderTopLeftRadius: 4,
              borderBottomLeftRadius: 4,
              backgroundColor: THEME.ink,
            }}
          />
          <View style={{ flexDirection: 'row', gap: COLUMN_GAP, alignItems: 'flex-start', paddingRight: PAGE_GUTTER }}>
            {shelf.tiles.map((tile) => (
              <ShelfTag key={tile.item.id} tile={tile} onPress={onPressItem} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

interface PantryShelvesProps {
  shelves: PantryShelf[];
  /** Shown when the chosen place has nothing in it. */
  emptyMessage: string;
  onPressItem: (item: PantryItem) => void;
  onSeeAll: (shelf: PantryShelf) => void;
}

/** One storage place drawn as shelves: each row scrolls sideways, packages stand on a board. */
export function PantryShelves({ shelves, emptyMessage, onPressItem, onSeeAll }: PantryShelvesProps) {
  if (shelves.length === 0) {
    return (
      <View className="rounded-[18px] border border-border bg-card px-4 py-6">
        <Text className="text-center text-sm text-muted">{emptyMessage}</Text>
      </View>
    );
  }
  return (
    <View className="gap-1">
      {shelves.map((shelf) => (
        <ShelfRow key={shelf.id} shelf={shelf} onPressItem={onPressItem} onSeeAll={onSeeAll} />
      ))}
    </View>
  );
}
