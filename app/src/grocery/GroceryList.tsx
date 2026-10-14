import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { GroceryItem } from '../data/groceryRows';
import { isTempId } from '../data/listOps';
import { colors, radius, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { GROCERY_COPY, groceryRowDetail, groceryRowLabel, type GroceryView } from './groceryLogic';

type Props = {
  view: GroceryView;
  /** False while offline, or while a change is waiting: ticking is blocked. */
  canChange: boolean;
  onTick: (item: GroceryItem) => void;
  onUntick: (item: GroceryItem) => void;
  onClearTicked: () => void;
};

/** "To buy" by aisle (produce first), then "Ticked" with Clear ticked. */
export function GroceryList({ view, canChange, onTick, onUntick, onClearTicked }: Props) {
  return (
    <View style={{ gap: space.groupGap }}>
      {view.aisles.map((aisle) => (
        <Section key={aisle.category} title={aisle.label} count={aisle.items.length}>
          {aisle.items.map((item, index) => (
            <Row key={item.id} item={item} first={index === 0} disabled={!canChange || isTempId(item.id)} onPress={() => onTick(item)} />
          ))}
        </Section>
      ))}
      {view.ticked.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Section title={GROCERY_COPY.tickedSection} count={view.ticked.length} hint={GROCERY_COPY.tickedHint}>
            {view.ticked.map((item, index) => (
              <Row key={item.id} item={item} first={index === 0} disabled={!canChange} onPress={() => onUntick(item)} />
            ))}
          </Section>
          <Button label={GROCERY_COPY.clearTicked} kind="secondary" disabled={!canChange} onPress={onClearTicked} />
        </View>
      ) : null}
    </View>
  );
}

function Section({ title, count, hint, children }: { title: string; count: number; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText variant="sectionTitle" bold accessibilityRole="header">
          {title}
        </AppText>
        <AppText variant="secondary" color="muted">
          {String(count)}
        </AppText>
      </View>
      {hint ? (
        <AppText variant="secondary" color="muted">
          {hint}
        </AppText>
      ) : null}
      <View
        style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({ item, first, disabled, onPress }: { item: GroceryItem; first: boolean; disabled: boolean; onPress: () => void }) {
  const ticked = item.checked;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={groceryRowLabel(item)}
      accessibilityHint={ticked ? GROCERY_COPY.untickA11yHint : GROCERY_COPY.tickA11yHint}
      accessibilityState={{ checked: ticked, disabled }}
      // react-native-web reads the aria-* props (accessibilityState alone does not reach the DOM).
      aria-checked={ticked}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: touch.min + 12,
        paddingHorizontal: space.cardPadding,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        backgroundColor: pressed ? colors.sand : colors.card,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: disabled ? 0.6 : 1,
      })}
    >
      {/* The tick box: ink outline; filled ink with a white tick once ticked (ink = selected). */}
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: colors.ink,
          backgroundColor: ticked ? colors.ink : colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ticked ? (
          <AppText variant="secondary" bold color="onPrimary">
            ✓
          </AppText>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText bold numberOfLines={2} color={ticked ? 'muted' : 'ink'} style={ticked ? { textDecorationLine: 'line-through' } : undefined}>
          {item.name}
        </AppText>
        <AppText variant="secondary" color="muted">
          {groceryRowDetail(item)}
        </AppText>
      </View>
    </Pressable>
  );
}
