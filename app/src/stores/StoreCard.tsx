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
};

/** One store: name, distance, address, Directions, Weekly ad (when the chain has one) and Save. */
export function StoreCard({ store, favorite, onToggleFavorite, disabled }: Props) {
  const name = storeDisplayName(store);
  const address = formatStoreAddress(store);
  const distance = store.distanceMiles != null ? formatDistanceMiles(store.distanceMiles) : '';
  const weeklyAd = resolveWeeklyAdLink(store);
  const weeklyAdLabel = weeklyAd?.thirdParty ? STORES_COPY.weeklyAdThirdParty : STORES_COPY.weeklyAd;

  return (
    <View testID={`store-${store.id}`}>
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
            accessibilityRole="checkbox"
            accessibilityLabel={STORES_COPY.favoriteA11y(name)}
            accessibilityState={{ checked: favorite, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onToggleFavorite(store, !favorite)}
            style={({ pressed }) => ({
              minHeight: touch.min,
              paddingHorizontal: 16,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: favorite ? colors.ink : colors.border,
              backgroundColor: favorite ? colors.ink : colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 'auto',
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <AppText variant="button" color={favorite ? 'onPrimary' : 'ink'}>
              {favorite ? STORES_COPY.favorited : STORES_COPY.favorite}
            </AppText>
          </Pressable>
        </View>
      </Card>
    </View>
  );
}
