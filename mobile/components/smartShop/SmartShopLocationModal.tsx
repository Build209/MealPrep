import { Ionicons } from '../../lib/icons/Ionicons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import { SMART_SHOP_COPY } from '../../config/smartShop';
import { THEME } from '../../config/appConfig';

type Props = {
  visible: boolean;
  zip: string;
  onZipChange: (value: string) => void;
  locationHint: string | null;
  loadingStores: boolean;
  onUseLocation: () => void;
  onSaveZip: () => void;
  onRequestClose?: () => void;
};

export function SmartShopLocationModal({
  visible,
  zip,
  onZipChange,
  locationHint,
  loadingStores,
  onUseLocation,
  onSaveZip,
  onRequestClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onRequestClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-6">
        <View className="w-full max-w-md rounded-3xl border border-border bg-card p-5">
          <Text className="text-lg font-bold text-ink">{SMART_SHOP_COPY.locationModalTitle}</Text>
          <Text className="mt-2 text-sm text-muted">{SMART_SHOP_COPY.locationModalBody}</Text>
          <Pressable
            onPress={onUseLocation}
            className="mt-4 min-h-[48px] flex-row items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3"
          >
            <Ionicons name="locate" size={20} color={THEME.onPrimary} />
            <Text className="font-bold text-on-primary">{SMART_SHOP_COPY.locationUseDevice}</Text>
          </Pressable>
          {locationHint ? <Text className="mt-2 text-xs text-success-dark">{locationHint}</Text> : null}
          <View className="mt-3 flex-row gap-2">
            <TextInput
              value={zip}
              onChangeText={onZipChange}
              keyboardType="number-pad"
              placeholder={SMART_SHOP_COPY.locationZipPlaceholder}
              placeholderTextColor={THEME.muted}
              maxLength={10}
              className="flex-1 rounded-xl border border-border bg-paper px-4 py-3 text-base text-ink"
            />
            <Pressable onPress={onSaveZip} className="rounded-full bg-slate px-4 py-3">
              <Text className="font-bold text-on-primary">{SMART_SHOP_COPY.locationContinue}</Text>
            </Pressable>
          </View>
          {loadingStores ? (
            <Text className="mt-3 text-center text-xs text-muted">{SMART_SHOP_COPY.loadingStores}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
