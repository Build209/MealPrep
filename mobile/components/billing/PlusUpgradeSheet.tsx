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

const FORKY = require('../../assets/forkinator/forkinator-full.png');

/**
 * Full-screen Plus offer, to the approved mockup (design handoff D-2): green top with Forky and
 * a close button, then a cream panel with the heading, the one benefit line, the plan choice,
 * the renewal terms and the buy button. Closing is always one tap, top right or "Not now".
 */
export function PlusUpgradeSheet({ visible, onClose }: Props) {
  useEffect(() => {
    if (visible) logUsageEvent('plus_offer_shown', { source: 'sheet' });
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-primary">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="h-[232px] items-center justify-end">
            <Image
              source={FORKY}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessible={false}
              style={{ width: 114, height: 210 }}
            />
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={PLUS_UPGRADE_COPY.close}
              className="absolute right-4 top-4 h-11 w-11 items-center justify-center rounded-full bg-black/20"
            >
              <Text className="text-xl font-bold text-on-primary">×</Text>
            </Pressable>
          </View>

          <View className="flex-1 rounded-t-[28px] bg-cream px-5 pb-6 pt-6">
            <View className="w-full max-w-md self-center">
              <Text accessibilityRole="header" className="text-[28px] font-extrabold leading-8 text-primary">
                Meal<Text className="text-tomato">Plan</Text>atic Plus
              </Text>
              <Text className="mt-2 text-base leading-6 text-ink">{PLUS_UPGRADE_COPY.benefit}</Text>
              <PlusUpgradeOptions onNotNow={onClose} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
