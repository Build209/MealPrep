import { ScrollView, View } from 'react-native';
import { colors, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { CookwareDrawing } from './CookwareDrawing';
import { GEAR_COPY as COPY } from './copy';
import { shelves, type GearItem, type ShelfKey } from './gear';

const COLUMN_W = 96;
const COLUMN_GAP = 8;

/**
 * What the person has, drawn the way the pantry is: sideways shelves, each drawing standing on an
 * ink board with its name on a banana tag underneath (DESIGN.md, Pantry shelves). Read-only.
 */
export function CookwareShelves({ catalog, ownedSlugs }: { catalog: readonly GearItem[]; ownedSlugs: readonly string[] }) {
  const owned = new Set(ownedSlugs);
  const rows = shelves(catalog)
    .map((s) => ({ key: s.key as ShelfKey, items: s.items.filter((i) => owned.has(i.slug)) }))
    .filter((s) => s.items.length > 0);
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: 4 }} testID="cookware-shelves">
      {rows.map((row) => (
        <View key={row.key} style={{ marginBottom: 8 }}>
          <View style={{ minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppText variant="button" accessibilityRole="header">
              {COPY.shelfTitle[row.key]}
            </AppText>
            <AppText variant="secondary" color="muted">
              {String(row.items.length)}
            </AppText>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.cardPadding }} contentContainerStyle={{ paddingLeft: space.cardPadding }}>
            <View>
              <View style={{ flexDirection: 'row', gap: COLUMN_GAP, alignItems: 'flex-end', paddingTop: 6 }}>
                {row.items.map((item) => (
                  <View key={item.slug} style={{ width: COLUMN_W, alignItems: 'center' }} accessible accessibilityLabel={item.name}>
                    <CookwareDrawing slug={item.slug} category={item.category} />
                  </View>
                ))}
              </View>
              <View style={{ height: 8, marginLeft: -8, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, backgroundColor: colors.ink }} />
              <View style={{ flexDirection: 'row', gap: COLUMN_GAP, alignItems: 'flex-start', paddingRight: space.cardPadding }}>
                {row.items.map((item) => (
                  <View
                    key={item.slug}
                    style={{ width: COLUMN_W, minHeight: touch.min, paddingHorizontal: 5, paddingTop: 5, paddingBottom: 7, borderBottomLeftRadius: 9, borderBottomRightRadius: 9, backgroundColor: colors.banana }}
                    importantForAccessibility="no-hide-descendants"
                    aria-hidden
                  >
                    <AppText variant="label" color="onBanana" numberOfLines={3} style={{ textAlign: 'center' }}>
                      {item.name}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      ))}
    </View>
  );
}
