import { useEffect } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import { PLUS_UPGRADE_COPY } from '../../config/pricing';
import { PlusUpgradeOptions } from './PlusUpgradeOptions';
import { logUsageEvent } from '../../lib/usage/usageLog';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const FORKY = require('../../assets/forkinator/forkinator-idea.png');

/**
 * Full-screen plans offer (sticker aisle look): the banana bar with Forky, a close button and the
 * title, then the benefit text, the plan choice, the renewal terms and the buy button. Closing is
 * always one tap, top right or "Not now".
 */
export function PlusUpgradeSheet({ visible, onClose }: Props) {
  useEffect(() => {
    if (visible) logUsageEvent('plus_offer_shown', { source: 'sheet' });
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-banana">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="px-5 pb-5 pt-4">
            <Image
              source={FORKY}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessible={false}
              style={{ width: 58, height: 148, transform: [{ rotate: '-6deg' }] }}
            />
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={PLUS_UPGRADE_COPY.close}
              className="absolute right-4 top-4 h-11 w-11 items-center justify-center rounded-[14px] bg-card"
            >
              <Text className="text-xl font-bold text-ink">×</Text>
            </Pressable>
            <Text accessibilityRole="header" className="mt-2 font-display text-[38px] leading-[38px] text-on-banana">
              {PLUS_UPGRADE_COPY.screenTitle}
            </Text>
          </View>

          <View className="flex-1 bg-cream px-5 pb-6 pt-5">
            <View className="w-full max-w-md self-center">
              <Text className="text-base leading-6 text-ink">{PLUS_UPGRADE_COPY.benefit}</Text>
              <PlusUpgradeOptions onNotNow={onClose} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
