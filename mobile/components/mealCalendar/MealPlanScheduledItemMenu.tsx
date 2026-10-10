import { Pressable, Text, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import type { MealPlanItem } from '../../types/mealprep';
import { buildLocalDayRange } from '../../lib/mealCalendar/dates';
import { MEAL_CALENDAR } from '../../config/mealCalendar';

export interface MealPlanScheduledItemMenuProps {
  visible: boolean;
  item: MealPlanItem | null;
  onClose: () => void;
  onRemove: () => void;
  onUnschedule: () => void;
  onMoveToDate: (isoDate: string) => void;
  onAddToGoogleCalendar: () => void;
}

export function MealPlanScheduledItemMenu({
  visible,
  item,
  onClose,
  onRemove,
  onUnschedule,
  onMoveToDate,
  onAddToGoogleCalendar,
}: MealPlanScheduledItemMenuProps) {
  const moveTargets = buildLocalDayRange(MEAL_CALENDAR.daysAhead);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <View className="rounded-t-3xl bg-card px-4 pb-8 pt-4">
          <Text className="text-lg font-bold text-ink" numberOfLines={2}>
            {item?.title ?? 'Meal'}
          </Text>
          <Text className="mt-1 text-sm text-muted">Schedule actions</Text>

          <Pressable onPress={onAddToGoogleCalendar} className="mt-4 rounded-xl bg-primary-light px-4 py-3">
            <Text className="font-bold text-primary-dark">Add to Google Calendar</Text>
          </Pressable>

          <Text className="mt-4 text-xs font-semibold uppercase text-muted">Move to</Text>
          {moveTargets.map((day) => (
            <Pressable
              key={day.isoDate}
              onPress={() => {
                onMoveToDate(day.isoDate);
                onClose();
              }}
              className="border-t border-border py-3"
            >
              <Text className="font-semibold text-ink">
                {day.weekdayLabel} · {day.monthDayLabel}
              </Text>
            </Pressable>
          ))}

          <Pressable onPress={onUnschedule} className="mt-2 rounded-xl border border-border px-4 py-3">
            <Text className="font-bold text-ink">Move to unscheduled list</Text>
          </Pressable>

          <Pressable onPress={onRemove} className="mt-2 rounded-xl border border-danger/40 px-4 py-3">
            <Text className="font-bold text-danger">Remove meal</Text>
          </Pressable>

          <Pressable onPress={onClose} className="mt-3 items-center py-2">
            <Text className="font-bold text-muted">Close</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
