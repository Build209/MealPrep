import { Pressable, View } from 'react-native';
import { colors, layout, radius, space, touch } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';

type Props = {
  message: string;
  /** Shown as a button when there is something to undo. */
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  onDismiss: () => void;
};

/** A bar pinned above the tab bar: "Removed Rice." with Undo, or a plain message. */
export function UndoBar({ message, actionLabel, onAction, actionDisabled, onDismiss }: Props) {
  return (
    <View
      style={{ pointerEvents: 'box-none', position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.gutter, alignItems: 'center' }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          width: '100%',
          maxWidth: layout.maxWidth - space.gutter * 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.gap,
          paddingLeft: space.cardPadding,
          paddingRight: 8,
          paddingVertical: 8,
          borderRadius: radius.card,
          backgroundColor: colors.ink,
        }}
      >
        <AppText color="onPrimary" style={{ flex: 1 }} accessibilityRole="alert">
          {message}
        </AppText>
        {actionLabel && onAction ? (
          <Button label={actionLabel} kind="secondary" disabled={actionDisabled} onPress={onAction} />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          style={{ minHeight: touch.min, minWidth: touch.min, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}
        >
          <AppText variant="secondary" bold color="onPrimary">
            Dismiss
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
