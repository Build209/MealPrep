import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '../../lib/icons/Ionicons';
import { THEME } from '../../config/appConfig';
import { useApp } from '../../context/AppContext';
import {
  buildWeeklyRecap,
  parseKitchenWeeks,
  weekStartOf,
  WEEKLY_RECAP_COPY,
  WEEKLY_RECAP_DISMISSED_WEEK_KEY,
  WEEKLY_RECAP_RULES,
  type WeeklyRecap,
} from '../../lib/recap/weeklyRecap';
import { readJson, writeJson } from '../../lib/storage';
import { getSupabase } from '../../lib/supabase';

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * "This week in your kitchen" on Home (learning step 5): the signed-in person's own counts for
 * the week and how many weeks in a row they have used their kitchen. Counts only, no money.
 *
 * Shows nothing for guests, in demo mode, when there is no recent activity, when it was closed
 * this week, or when the recap function is not on the server yet. It never shows an error.
 */
export function WeeklyRecapCard({ className = 'mt-4' }: { className?: string }) {
  const { session, demoMode } = useApp();
  const userId = session?.user?.id ?? null;
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [dismissedWeek, setDismissedWeek] = useState<string | null>(() =>
    readJson<string | null>(WEEKLY_RECAP_DISMISSED_WEEK_KEY, null),
  );

  useEffect(() => {
    if (!userId || demoMode) {
      setRecap(null);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('my_kitchen_weeks', {
          p_tz: deviceTimeZone(),
          p_weeks: WEEKLY_RECAP_RULES.weeksFetched,
        });
        if (cancelled || error) return;
        setRecap(buildWeeklyRecap(parseKitchenWeeks(data), new Date()));
      } catch {
        // Offline, or the function is not there yet: no card.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demoMode, userId]);

  const thisWeek = weekStartOf(new Date());
  if (!recap || recap.phrases.length === 0 || dismissedWeek === thisWeek) return null;

  function dismiss() {
    writeJson(WEEKLY_RECAP_DISMISSED_WEEK_KEY, thisWeek);
    setDismissedWeek(thisWeek);
  }

  return (
    <View className={`rounded-[18px] border border-border bg-card py-2 pl-4 pr-1 ${className}`}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 py-1">
          <Text accessibilityRole="header" className="text-sm font-bold text-ink">
            {recap.title}
          </Text>
          <Text className="mt-0.5 text-sm text-ink">{recap.phrases.join(' · ')}</Text>
          {recap.streakLine ? (
            <Text className="mt-0.5 text-xs font-semibold text-primary">{recap.streakLine}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={WEEKLY_RECAP_COPY.dismissA11y}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full"
        >
          <Ionicons name="close" size={18} color={THEME.muted} />
        </Pressable>
      </View>
    </View>
  );
}
