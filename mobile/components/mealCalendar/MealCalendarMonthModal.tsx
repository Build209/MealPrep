import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Modal } from '../BackAwareModal';
import { Ionicons } from '../../lib/icons/Ionicons';
import { localDateString, monthMatrix } from '../../lib/mealCalendar/dates';
import type { MealPlanItem } from '../../types/mealprep';
import { THEME } from '../../config/appConfig';

interface MealCalendarMonthModalProps {
  visible: boolean;
  mealPlan: MealPlanItem[];
  onClose: () => void;
  onSelectDate: (isoDate: string) => void;
}

export function MealCalendarMonthModal({
  visible,
  mealPlan,
  onClose,
  onSelectDate,
}: MealCalendarMonthModalProps) {
  const today = localDateString();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const weeks = useMemo(
    () => monthMatrix(cursor.year, cursor.month),
    [cursor.month, cursor.year],
  );

  const monthLabel = useMemo(
    () => new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    [cursor.month, cursor.year],
  );

  const mealCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of mealPlan) {
      if (item.made || !item.scheduledOn) continue;
      map.set(item.scheduledOn, (map.get(item.scheduledOn) ?? 0) + 1);
    }
    return map;
  }, [mealPlan]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-paper px-4 pt-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-ink">Meal calendar</Text>
          <Pressable onPress={onClose} className="rounded-full bg-card p-2">
            <Ionicons name="close" size={22} color={THEME.ink} />
          </Pressable>
        </View>

        <View className="mt-4 flex-row items-center justify-between">
          <Pressable
            onPress={() =>
              setCursor((prev) => {
                const month = prev.month === 0 ? 11 : prev.month - 1;
                const year = prev.month === 0 ? prev.year - 1 : prev.year;
                return { year, month };
              })
            }
            className="rounded-full bg-card p-2"
          >
            <Ionicons name="chevron-back" size={20} color={THEME.ink} />
          </Pressable>
          <Text className="text-base font-bold text-ink">{monthLabel}</Text>
          <Pressable
            onPress={() =>
              setCursor((prev) => {
                const month = prev.month === 11 ? 0 : prev.month + 1;
                const year = prev.month === 11 ? prev.year + 1 : prev.year;
                return { year, month };
              })
            }
            className="rounded-full bg-card p-2"
          >
            <Ionicons name="chevron-forward" size={20} color={THEME.ink} />
          </Pressable>
        </View>

        <View className="mt-3 flex-row">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
            <Text key={label} className="flex-1 text-center text-xs font-semibold text-muted">
              {label}
            </Text>
          ))}
        </View>

        <ScrollView className="mt-2 flex-1">
          {weeks.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} className="mb-1 flex-row">
              {week.map((isoDate, dayIndex) => {
                if (!isoDate) {
                  return <View key={`empty-${weekIndex}-${dayIndex}`} className="flex-1 p-1" />;
                }
                const count = mealCounts.get(isoDate) ?? 0;
                const isToday = isoDate === today;
                const dayNum = Number.parseInt(isoDate.slice(8, 10), 10);
                return (
                  <Pressable
                    key={isoDate}
                    onPress={() => {
                      onSelectDate(isoDate);
                      onClose();
                    }}
                    className={`m-0.5 flex-1 items-center rounded-xl p-1 ${isToday ? 'bg-primary-light' : 'bg-card'}`}
                  >
                    <Text className={`text-sm font-bold ${isToday ? 'text-primary-dark' : 'text-ink'}`}>{dayNum}</Text>
                    {count > 0 ? (
                      <Text className="text-[10px] font-semibold text-primary-dark">{count} meal{count === 1 ? '' : 's'}</Text>
                    ) : (
                      <Text className="text-[10px] text-transparent">.</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}

          <Text className="mt-4 text-sm text-muted">Tap a day to schedule meals in the week view.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
