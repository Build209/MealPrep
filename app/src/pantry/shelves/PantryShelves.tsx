import { memo, type ReactNode } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import type { PantryStorageLocation } from '../../kitchen/storage';
import { colors, layout, radius, space, touch } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Card } from '../../ui/Card';
import { ChoicePills } from '../parts/ChoicePills';
import type { ShelvedItem } from '../types';
import { crateParts, SHAPE_PARTS, TILE_H, TILE_W } from './packageParts';
import { PACKAGE_LABEL_BOX, SHELF_PLACES, SHELF_VIEW_COPY } from './packages';
import { buildPantryShelves, type PantryShelf, type ShelfTile } from './shelfView';

/**
 * The shelves view (owner's mockup B), ported from the old app's
 * mobile/components/pantry/PantryShelves.tsx: one place at a time, each shelf scrolls
 * sideways, packages stand on an ink board with their name tag hanging below it.
 */

/** Each package stands in a column this wide; the column's name tag hangs under the board. */
const COLUMN_W = 96;
const COLUMN_GAP = 8;

const PLACE_OPTIONS = SHELF_PLACES.map((id) => ({ id, label: SHELF_VIEW_COPY.placeLabels[id] }));

type Props = {
  items: readonly ShelvedItem[];
  place: PantryStorageLocation;
  onChangePlace: (place: PantryStorageLocation) => void;
  onPressItem: (item: ShelvedItem) => void;
  /** "See all" and "+N more": show this place in the list view. */
  onSeeAll: () => void;
  /**
   * One more pill after the storage places whose content replaces the shelves (the Kitchen gear
   * picker). Not a storage place: it never filters or files an item.
   */
  extra?: { label: string; active: boolean; onSelect: () => void; content: ReactNode };
  now?: Date;
};

const EXTRA_ID = '__extra__';

export function PantryShelves({ items, place, onChangePlace, onPressItem, onSeeAll, extra, now = new Date() }: Props) {
  const shelves = buildPantryShelves(items, place, now);
  const options = extra ? [...PLACE_OPTIONS, { id: EXTRA_ID, label: extra.label }] : PLACE_OPTIONS;
  const value: string = extra?.active ? EXTRA_ID : place;
  return (
    <View style={{ gap: space.gap }}>
      <ChoicePills
        label="Storage place"
        options={options}
        value={value}
        onChange={(id) => (id === EXTRA_ID ? extra?.onSelect() : onChangePlace(id as PantryStorageLocation))}
      />
      {extra?.active ? (
        extra.content
      ) : shelves.length === 0 ? (
        <Card>
          <AppText variant="secondary" color="muted" style={{ textAlign: 'center' }}>
            {SHELF_VIEW_COPY.emptyPlace(SHELF_VIEW_COPY.placeLabels[place])}
          </AppText>
        </Card>
      ) : (
        <View style={{ gap: 4 }}>
          {shelves.map((shelf) => (
            <ShelfRow key={shelf.id} shelf={shelf} onPressItem={onPressItem} onSeeAll={onSeeAll} />
          ))}
        </View>
      )}
    </View>
  );
}

const PackageTile = memo(function PackageTile({ tile, onPress }: { tile: ShelfTile; onPress: (item: ShelvedItem) => void }) {
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
      {/* The printed label. The name is on the shelf-edge tag under the board, where it can be read in full. */}
      <View
        style={{ position: 'absolute', top, bottom, left: inset, right: inset, borderRadius: 3, backgroundColor: tile.labelColor }}
      />
      {tile.quantityBadge ? (
        <View
          style={{
            position: 'absolute',
            top: -2,
            left: -6,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: radius.pill,
            borderWidth: 2,
            borderColor: colors.card,
            backgroundColor: colors.ink,
            transform: [{ rotate: '8deg' }],
          }}
        >
          <AppText variant="label" display color="banana">
            {tile.quantityBadge}
          </AppText>
        </View>
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
            borderRadius: radius.pill,
            backgroundColor: colors.warning,
          }}
        >
          <AppText variant="label" color="onWarning">
            {tile.daysBadge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
});

/** The name tag that hangs from the shelf edge under a package, like a price tag in a store. */
function ShelfTag({ tile, onPress }: { tile: ShelfTile; onPress: (item: ShelvedItem) => void }) {
  return (
    <Pressable
      onPress={() => onPress(tile.item)}
      // The package above already reads the name out; the tag is a bigger target for the same tap.
      aria-hidden
      focusable={false}
      importantForAccessibility="no-hide-descendants"
      style={({ pressed }) => ({
        width: COLUMN_W,
        minHeight: touch.min,
        paddingHorizontal: 5,
        paddingTop: 5,
        paddingBottom: 7,
        borderBottomLeftRadius: 9,
        borderBottomRightRadius: 9,
        backgroundColor: colors.banana,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <AppText variant="label" color="onBanana" numberOfLines={3} style={{ textAlign: 'center' }}>
        {tile.item.name}
      </AppText>
      {tile.sizeLabel ? (
        <AppText variant="label" color="onBanana" numberOfLines={1} style={{ textAlign: 'center', fontWeight: '400' }}>
          {tile.sizeLabel}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function ShelfRow({ shelf, onPressItem, onSeeAll }: { shelf: PantryShelf; onPressItem: (item: ShelvedItem) => void; onSeeAll: () => void }) {
  const { width } = useWindowDimensions();
  // A short shelf still gets a board that reaches the right edge of the screen.
  const boardMinWidth = Math.min(width, layout.maxWidth) - space.gutter;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText variant="button" accessibilityRole="header">
          {shelf.name}
        </AppText>
        <AppText variant="secondary" color="muted">
          {String(shelf.count)}
        </AppText>
        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`${SHELF_VIEW_COPY.seeAll}: ${shelf.name}`}
          style={{ marginLeft: 'auto', minHeight: touch.min, justifyContent: 'center', paddingLeft: 16 }}
        >
          <AppText variant="secondary" bold>
            {SHELF_VIEW_COPY.seeAll}
          </AppText>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space.gutter }}
        contentContainerStyle={{ paddingLeft: space.gutter }}
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
                onPress={onSeeAll}
                accessibilityRole="button"
                accessibilityLabel={`${SHELF_VIEW_COPY.moreTile(shelf.moreCount)}: ${shelf.name}`}
                style={{ width: COLUMN_W, height: TILE_H, paddingTop: 14, paddingHorizontal: 8 }}
              >
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.control,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: colors.muted,
                  }}
                >
                  <AppText variant="secondary" bold style={{ textAlign: 'center' }}>
                    {SHELF_VIEW_COPY.moreTile(shelf.moreCount)}
                  </AppText>
                </View>
              </Pressable>
            ) : null}
          </View>
          <View style={{ height: 8, marginLeft: -8, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, backgroundColor: colors.ink }} />
          <View style={{ flexDirection: 'row', gap: COLUMN_GAP, alignItems: 'flex-start', paddingRight: space.gutter }}>
            {shelf.tiles.map((tile) => (
              <ShelfTag key={tile.item.id} tile={tile} onPress={onPressItem} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
