import { Pressable, View } from 'react-native';
import { colors, radius, space, touch } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import type { ShelvedItem } from '../types';
import { groupPantryForList, pantryRowDetail, pantryRowLabel, type PantryListGroup } from './grouping';

type Props = {
  items: readonly ShelvedItem[];
  onPressItem: (item: ShelvedItem) => void;
  now?: Date;
};

/** The list view: "Use soon", then Fridge, Pantry, Spice rack. Tapping a row opens the edit sheet. */
export function PantryList({ items, onPressItem, now = new Date() }: Props) {
  const groups = groupPantryForList(items, now);
  return (
    <View style={{ gap: space.groupGap }}>
      {groups.map((group) => (
        <ListGroup key={group.id} group={group} onPressItem={onPressItem} now={now} />
      ))}
    </View>
  );
}

function ListGroup({ group, onPressItem, now }: { group: PantryListGroup; onPressItem: (item: ShelvedItem) => void; now: Date }) {
  const soon = group.id === 'use-soon';
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText variant="sectionTitle" bold accessibilityRole="header">
          {group.title}
        </AppText>
        <AppText variant="secondary" color="muted">
          {String(group.items.length)}
        </AppText>
      </View>
      <View
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.card,
          overflow: 'hidden',
        }}
      >
        {group.items.map((item, index) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={pantryRowLabel(item, now)}
            accessibilityHint="Opens the item to edit or delete it"
            onPress={() => onPressItem(item)}
            style={({ pressed }) => ({
              minHeight: touch.min + 12,
              paddingHorizontal: space.cardPadding,
              paddingVertical: 10,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
              backgroundColor: pressed ? colors.sand : colors.card,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            })}
          >
            {soon ? (
              // Yellow means time (DESIGN.md): a small marker on rows that are due.
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning }} />
            ) : null}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText bold numberOfLines={2}>
                {item.name}
              </AppText>
              <AppText variant="secondary" color="muted">
                {pantryRowDetail(item, now)}
              </AppText>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
