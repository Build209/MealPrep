import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '../../lib/icons/Ionicons';
import { THEME } from '../../config/appConfig';

export function RecipesTabCollapsibleSection({
  title,
  heading,
  headerAction,
  bubbleRowAbove = false,
  expanded,
  onToggle,
  bubbleRow,
  children,
  loading,
}: {
  /** Names the expand/collapse toggle for screen readers. */
  title: string;
  /** Short heading shown on screen; falls back to `title`. */
  heading?: string;
  /** Optional link shown at the right end of the heading row. */
  headerAction?: React.ReactNode;
  /** Show the chips/avatars above the heading instead of under it. */
  bubbleRowAbove?: boolean;
  expanded: boolean;
  onToggle: () => void;
  /** Horizontally scrollable chips/avatars; always visible, never gated on `expanded`. */
  bubbleRow?: React.ReactNode;
  children?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <View className="mt-4">
      {bubbleRowAbove ? <>{bubbleRow ? <View className="mb-3">{bubbleRow}</View> : null}</> : null}
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title}, ${expanded ? 'collapse' : 'expand'}`}
          className="min-h-[44px] min-w-0 flex-1 flex-row items-center gap-2"
        >
          <Text
            accessibilityRole="header"
            className="shrink font-display text-[22px] leading-[26px] text-ink"
          >
            {heading ?? title}
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={THEME.muted} />
          {loading ? (
            <Text className="text-xs text-muted">Loading…</Text>
          ) : null}
        </Pressable>
        {headerAction ?? null}
      </View>
      {bubbleRowAbove ? null : <>{bubbleRow ? <View className="mt-1">{bubbleRow}</View> : null}</>}
      {expanded && children ? <View className="mt-3">{children}</View> : null}
    </View>
  );
}
