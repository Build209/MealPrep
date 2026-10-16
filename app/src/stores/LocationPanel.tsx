import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { View } from 'react-native';
import { Field } from '../auth/Field';
import { colors, radius, space } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { STORES_COPY } from './copy';
import type { GeoPermission } from './logic';

type Props = {
  permission: GeoPermission | null;
  initialZip: string;
  locating: boolean;
  busy: boolean;
  error: string | null;
  /** "Location is off" help: browser wording on web, Settings wording on phones. */
  deniedHelp?: string;
  onUseLocation: () => void;
  onSaveZip: (zip: string) => void;
};

/**
 * "Find stores near you": use the device's location, or type a ZIP. A compact sheet under the hero
 * (outlined in ink, so it reads as the thing to fill in). Location off or not available: ZIP only,
 * with the old help text.
 */
export function LocationPanel({ permission, initialZip, locating, busy, error, deniedHelp, onUseLocation, onSaveZip }: Props) {
  const [zip, setZip] = useState(initialZip);
  const canLocate = permission !== 'unavailable' && permission !== 'denied';

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.ink,
        borderWidth: 1.5,
        borderRadius: radius.card,
        padding: space.cardPadding,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name="map-pin" size={18} color={colors.ink} accessibilityElementsHidden importantForAccessibility="no" />
        <AppText variant="sectionTitle" bold>
          {STORES_COPY.findStoresTitle}
        </AppText>
      </View>
      {canLocate ? (
        <Button label={locating ? STORES_COPY.locating : STORES_COPY.useMyLocation} disabled={busy} onPress={onUseLocation} />
      ) : null}
      {permission === 'denied' ? (
        <AppText variant="secondary" color="muted">
          {deniedHelp ?? STORES_COPY.locationDeniedHelp}
        </AppText>
      ) : null}
      {permission === 'unavailable' ? (
        <AppText variant="secondary" color="muted">
          {STORES_COPY.zipOnlyHelp}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field
            label={STORES_COPY.zipShort}
            value={zip}
            onChangeText={setZip}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={10}
            autoComplete="postal-code"
            onSubmitEditing={() => onSaveZip(zip)}
          />
        </View>
        <Button label={STORES_COPY.zipGo} kind={canLocate ? 'secondary' : 'primary'} disabled={busy} onPress={() => onSaveZip(zip)} />
      </View>
      {error ? (
        <AppText variant="secondary" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
