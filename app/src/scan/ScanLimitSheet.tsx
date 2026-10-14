import { Linking, Modal, Platform, Pressable, View } from 'react-native';
import { colors, layout, radius, space } from '../theme/tokens';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { LIVE_PLANS_URL, OUT_OF_SCANS_COPY } from './allowance';

/** Opens the live app's plans in a new tab on the web, or the browser on a phone. */
export function openLivePlans(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(LIVE_PLANS_URL, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(LIVE_PLANS_URL).catch(() => undefined);
}

/** Shown when the Scan button is tapped with no scans left: what the allowance is, and where plans are. */
export function ScanLimitSheet({ visible, limit, onClose }: { visible: boolean; limit: number; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(27,31,59,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={OUT_OF_SCANS_COPY.close} onPress={onClose} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          accessibilityLabel={OUT_OF_SCANS_COPY.title}
          style={{
            width: '100%',
            maxWidth: layout.maxWidth,
            alignSelf: 'center',
            backgroundColor: colors.paper,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            padding: space.gutter,
            gap: space.gap,
          }}
        >
          <AppText variant="sectionTitle" bold accessibilityRole="header">
            {OUT_OF_SCANS_COPY.title}
          </AppText>
          <AppText>{OUT_OF_SCANS_COPY.allowance(limit)}</AppText>
          <AppText color="muted">{OUT_OF_SCANS_COPY.reset}</AppText>
          <AppText variant="secondary" color="muted">
            {OUT_OF_SCANS_COPY.plans}
          </AppText>
          <Button label={OUT_OF_SCANS_COPY.seePlans} kind="secondary" accessibilityRole="link" onPress={openLivePlans} />
          <Button label={OUT_OF_SCANS_COPY.close} kind="quiet" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
