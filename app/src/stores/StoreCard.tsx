import Feather from '@expo/vector-icons/Feather';
import { useRef } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { colors, radius, space, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { splitActions } from './cardLogic';
import { STORES_COPY } from './copy';
import { resolveStoreActions } from './delivery';
import { mapsDirectionsUrl } from './links';
import { formatDistanceMiles, formatStoreAddress, storeDisplayName, type Store } from './logic';
import { StoreBadge } from './StoreBadge';

/** Opens a link in a new tab on the web, or the browser on a phone. */
export function openExternal(url: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url).catch(() => undefined);
}

type Props = {
  store: Store;
  favorite: boolean;
  onToggleFavorite: (store: Store, favorite: boolean) => void;
  disabled?: boolean;
  /** Opened from the Grocery list's row of circles: outlined, and reported once laid out so the screen can scroll to it. */
  focused?: boolean;
  onFocusedLayout?: (node: View) => void;
  /** "Order online": scrolls back to the page's Order online section. */
  onOrderOnline?: () => void;
};

/**
 * One store: logo badge, name, distance and address, then one clear main button (Weekly ad, else
 * Shop online), Directions, and one "Order online" button that scrolls to the page's Order online section, with the favourite star.
 */
export function StoreCard({ store, favorite, onToggleFavorite, disabled, focused, onFocusedLayout, onOrderOnline }: Props) {
  const ref = useRef<View>(null);
  const name = storeDisplayName(store);
  const address = formatStoreAddress(store);
  const distance = store.distanceMiles != null ? formatDistanceMiles(store.distanceMiles) : '';
  const { primary, secondary } = splitActions(resolveStoreActions({ key: store.id, name: store.chain || store.name, link: store.website }));
  const shopLinks = secondary.filter((a) => a.id === 'flyer' || a.id === 'shop');

  const open = (label: string, url: string, kind: 'primary' | 'secondary') => (
    <Button
      key={label}
      label={label}
      kind={kind}
      main={kind === 'primary'}
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${name}`}
      onPress={() => openExternal(url)}
    />
  );

  return (
    <View
      ref={ref}
      testID={`store-${store.id}`}
      onLayout={focused && onFocusedLayout ? () => ref.current && onFocusedLayout(ref.current) : undefined}
      style={focused ? { borderWidth: 2, borderColor: colors.ink, borderRadius: radius.card + 2 } : undefined}
    >
      <View
        style={{
          backgroundColor: colors.card,
          borderColor: favorite ? colors.warning : colors.border,
          borderWidth: favorite ? 2 : 1,
          borderRadius: radius.card,
          overflow: 'hidden',
        }}
      >
        <View style={{ height: 6, backgroundColor: favorite ? colors.warning : colors.banana }} />
        <View style={{ padding: space.cardPadding, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <StoreBadge chain={store.chain || store.name} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText variant="sectionTitle" bold>
                {name}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                {distance ? (
                  <View style={{ backgroundColor: colors.sand, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 }}>
                    <AppText variant="label">{distance}</AppText>
                  </View>
                ) : null}
                {favorite ? (
                  <View style={{ backgroundColor: colors.warningLight, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 }}>
                    <AppText variant="label" color="onWarning">
                      {STORES_COPY.savedTag}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={favorite ? STORES_COPY.removeFavoriteA11y(name) : STORES_COPY.addFavoriteA11y(name)}
              accessibilityState={{ disabled: !!disabled }}
              // react-native-web 0.21 reads the aria-* props (accessibilityState alone does not reach the DOM).
              aria-disabled={!!disabled}
              disabled={disabled}
              onPress={() => onToggleFavorite(store, !favorite)}
              style={({ pressed }) => ({
                width: touch.min,
                height: touch.min,
                borderRadius: radius.pill,
                borderWidth: 1,
                // Filled = favourite. Yellow is DESIGN.md's colour for favourites; the star stays a line icon.
                borderColor: favorite ? colors.warning : colors.border,
                backgroundColor: favorite ? colors.warning : colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              <Feather name="star" size={22} color={colors.ink} accessibilityElementsHidden importantForAccessibility="no" />
            </Pressable>
          </View>

          {address ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <Feather name="map-pin" size={14} color={colors.muted} style={{ marginTop: 3 }} accessibilityElementsHidden importantForAccessibility="no" />
              <AppText variant="secondary" color="muted" style={{ flex: 1, minWidth: 0 }}>
                {address}
              </AppText>
            </View>
          ) : null}

          {primary ? open(primary.label, primary.url, 'primary') : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {!primary ? null : shopLinks.map((a) => open(a.label, a.url, 'secondary'))}
            <Button
              label={STORES_COPY.directions}
              kind="secondary"
              accessibilityRole="link"
              accessibilityLabel={`${STORES_COPY.directions}: ${name}`}
              onPress={() => openExternal(mapsDirectionsUrl(store))}
            />
          </View>

          {onOrderOnline ? (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
              <Button
                label={STORES_COPY.orderOnlineButton}
                kind="secondary"
                accessibilityLabel={STORES_COPY.orderOnlineButtonA11y(name)}
                onPress={onOrderOnline}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
