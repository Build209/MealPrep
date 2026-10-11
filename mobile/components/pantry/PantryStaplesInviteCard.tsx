import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '../../lib/icons/Ionicons';
import { THEME } from '../../config/appConfig';
import { PANTRY_STAPLES_COPY } from '../../config/pantryStaples';

interface PantryStaplesInviteCardProps {
  onPick: () => void;
  onDismiss: () => void;
}

export function PantryStaplesInviteCard({ onPick, onDismiss }: PantryStaplesInviteCardProps) {
  return (
    <View className="rounded-[18px] border border-border bg-card px-4 py-4">
      <View className="flex-row items-start gap-3">
        <Text className="text-2xl" accessibilityElementsHidden importantForAccessibility="no">
          🧺
        </Text>
        <View className="flex-1">
          <Text className="text-base font-extrabold text-ink">{PANTRY_STAPLES_COPY.inviteTitle}</Text>
          <Text className="mt-1 text-sm text-muted">{PANTRY_STAPLES_COPY.inviteSubtitle}</Text>
          <Pressable onPress={onPick} className="mt-3 min-h-[44px] items-center justify-center rounded-full bg-primary px-4">
            <Text className="text-sm font-bold text-on-primary">{PANTRY_STAPLES_COPY.inviteCta}</Text>
          </Pressable>
          <Pressable onPress={onDismiss} className="mt-1 min-h-[44px] items-center justify-center">
            <Text className="text-sm font-semibold text-muted">{PANTRY_STAPLES_COPY.skip}</Text>
          </Pressable>
        </View>
        <Pressable onPress={onDismiss} accessibilityLabel="Dismiss" hitSlop={12} className="rounded-full p-1">
          <Ionicons name="close" size={20} color={THEME.muted} />
        </Pressable>
      </View>
    </View>
  );
}
