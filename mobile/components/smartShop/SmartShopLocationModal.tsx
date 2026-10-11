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
          <View className="flex-row items-start justify-between gap-3">
            <Text className="min-w-0 flex-1 text-lg font-bold text-ink" accessibilityRole="header">
              {SMART_SHOP_COPY.locationModalTitle}
            </Text>
            {/* The sheet had no visible way out: only the Escape key or the phone's Back closed it. */}
            {onRequestClose ? (
              <Pressable
                onPress={onRequestClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                className="-mr-2 -mt-2 h-11 w-11 shrink-0 items-center justify-center rounded-full"
              >
                <Ionicons name="close" size={22} color={THEME.muted} />
              </Pressable>
            ) : null}
          </View>
          <Text className="mt-2 text-sm text-muted">{SMART_SHOP_COPY.locationModalBody}</Text>
          <Pressable
            onPress={onUseLocation}
            accessibilityRole="button"
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
              accessibilityLabel={SMART_SHOP_COPY.locationZipPlaceholder}
              className="min-w-0 flex-1 rounded-xl border border-border bg-paper px-4 py-3 text-base text-ink"
            />
            <Pressable
              onPress={onSaveZip}
              accessibilityRole="button"
              className="min-h-[44px] shrink-0 items-center justify-center rounded-full bg-slate px-4 py-3"
            >
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
