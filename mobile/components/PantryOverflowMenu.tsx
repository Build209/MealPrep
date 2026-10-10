import { Ionicons } from '../lib/icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { Modal } from './BackAwareModal';
import { THEME } from '../config/appConfig';
import { labelForPantryStorageLocation, PANTRY_STORAGE_LOCATIONS, type PantryStorageLocation } from '../config/pantryStorage';

interface PantryOverflowMenuProps {
  visible: boolean;
  onClose: () => void;
  resortPreviewTotal: number;
  onResort: () => void;
  locationCounts: Record<PantryStorageLocation, number>;
  onClearLocation: (location: PantryStorageLocation, count: number) => void;
  totalCount: number;
  onClearAll: () => void;
}

export function PantryOverflowMenu({
  visible,
  onClose,
  resortPreviewTotal,
  onResort,
  locationCounts,
  onClearLocation,
  totalCount,
  onClearAll,
}: PantryOverflowMenuProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose}>
        <View className="mt-16 items-end px-4">
          <Pressable onPress={(e) => e.stopPropagation()} className="min-w-[260px] rounded-2xl border border-border bg-card p-2 shadow-lg">
            <Text className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted">More</Text>
            <Pressable
              disabled={resortPreviewTotal === 0}
              onPress={() => {
                onClose();
                onResort();
              }}
              className={`flex-row items-center gap-3 rounded-xl px-3 py-3 ${resortPreviewTotal === 0 ? 'opacity-40' : ''}`}
            >
              <Ionicons name="swap-vertical" size={20} color={THEME.primaryDark} />
              <Text className="flex-1 text-sm font-semibold text-ink">Re-sort items</Text>
            </Pressable>
            {PANTRY_STORAGE_LOCATIONS.map((location) => {
              const count = locationCounts[location] ?? 0;
              if (count === 0) return null;
              const label = labelForPantryStorageLocation(location);
              return (
                <Pressable
                  key={location}
                  onPress={() => {
                    onClose();
                    onClearLocation(location, count);
                  }}
                  className="flex-row items-center gap-3 rounded-xl px-3 py-3"
                >
                  <Ionicons name="trash-outline" size={20} color={THEME.danger} />
                  <Text className="flex-1 text-sm font-semibold text-danger">
                    Clear {label} ({count})
                  </Text>
                </Pressable>
              );
            })}
            {totalCount > 0 ? (
              <Pressable
                onPress={() => {
                  onClose();
                  onClearAll();
                }}
                className="flex-row items-center gap-3 rounded-xl px-3 py-3"
              >
                <Ionicons name="warning-outline" size={20} color={THEME.danger} />
                <Text className="flex-1 text-sm font-bold text-danger">Clear everything ({totalCount})</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} className="mt-1 items-center rounded-xl py-3">
              <Text className="text-sm font-bold text-muted">Close</Text>
            </Pressable>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
