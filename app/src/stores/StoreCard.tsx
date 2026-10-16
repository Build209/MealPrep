import Feather from '@expo/vector-icons/Feather';
import { useRef } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { colors, radius, touch } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { STORES_COPY } from './copy';
import { mapsDirectionsUrl, resolveWeeklyAdLink } from './links';
import { formatDistanceMiles, formatStoreAddress, storeDisplayName, type Store } from './logic';

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
};

/** One store: name, distance, address, Directions, Weekly ad (when the chain has one) and the favourite star. */
export function StoreCard({ store, favorite, onToggleFavorite, disabled, focused, onFocusedLayout }: Props) {
  const ref = useRef<View>(null);
  const name = storeDisplayName(store);
  const address = formatStoreAddress(store);
  const distance = store.distanceMiles != null ? formatDistanceMiles(store.distanceMiles) : '';
  const weeklyAd = resolveWeeklyAdLink(store);
  const weeklyAdLabel = weeklyAd?.thirdParty ? STORES_COPY.weeklyAdThirdParty : STORES_COPY.weeklyAd;

  return (
    <View
      ref={ref}
      testID={`store-${store.id}`}
      onLayout={focused && onFocusedLayout ? () => ref.current && onFocusedLayout(ref.current) : undefined}
      style={focused ? { borderWidth: 2, borderColor: colors.ink, borderRadius: radius.card + 2 } : undefined}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="sectionTitle" bold>
              {name}
            </AppText>
            {store.chain && store.name !== store.chain ? (
              <AppText variant="secondary" color="muted">
                {store.name}
              </AppText>
            ) : null}
          </View>
          {distance ? (
            <AppText variant="secondary" bold>
              {distance}
            </AppText>
          ) : null}
        </View>
        {address ? (
          <AppText variant="secondary" color="muted">
            {address}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Button
            label={STORES_COPY.directions}
            kind="secondary"
            accessibilityRole="link"
            accessibilityLabel={`${STORES_COPY.directions}: ${name}`}
            onPress={() => openExternal(mapsDirectionsUrl(store))}
          />
          {weeklyAd ? (
            <Button
              label={weeklyAdLabel}
              kind="secondary"
              accessibilityRole="link"
              accessibilityLabel={`${weeklyAdLabel}: ${name}`}
              onPress={() => openExternal(weeklyAd.url)}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favorite ? STORES_COPY.removeFavoriteA11y(name) : STORES_COPY.addFavoriteA11y(name)}
            accessibilityState={{ disabled: !!disabled }}
            // react-native-web 0.21 reads the aria-* props (accessibilityState alone does not reach the DOM).
            aria-disabled={!!disabled}
            disabled={disabled}
            testID={`store-star-${store.id}`}
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
              marginLeft: 'auto',
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <Feather name="star" size={22} color={colors.ink} accessibilityElementsHidden importantForAccessibility="no" />
          </Pressable>
        </View>
      </Card>
    </View>
  );
}
