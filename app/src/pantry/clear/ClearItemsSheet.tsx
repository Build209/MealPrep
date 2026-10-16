import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { colors, layout, radius, space, touch } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { CLEAR_COPY, CLEAR_SCOPES, scopeLabel, type ClearScope } from './clearScope';

type Props = {
  open: boolean;
  counts: Record<ClearScope, number>;
  /** False while offline: the confirm button is blocked and the reason is shown. */
  online: boolean;
  offlineMessage: string;
  onClose: () => void;
  /** Called once the person confirms. The sheet closes itself. */
  onConfirm: (scope: ClearScope) => void;
};

/** The "Clear items" entry at the top of the Pantry tab: neutral (ink on white), never tomato. */
export function ClearItemsButton({ disabled, onPress }: { disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={CLEAR_COPY.openA11y}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: touch.min,
        minWidth: touch.min,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Feather name="trash-2" size={18} color={colors.ink} accessibilityElementsHidden importantForAccessibility="no" />
      <AppText variant="secondary" bold>
        {CLEAR_COPY.open}
      </AppText>
    </Pressable>
  );
}

/**
 * Step 1: choose All items, Pantry, Fridge or Spice rack (each with its count; empty ones are
 * disabled). Step 2: a confirm that says exactly what goes. Nothing is deleted before step 2.
 */
export function ClearItemsSheet({ open, counts, online, offlineMessage, onClose, onConfirm }: Props) {
  const [scope, setScope] = useState<ClearScope | null>(null);
  const titleRef = useRef<View>(null);

  useEffect(() => {
    if (!open) setScope(null);
  }, [open]);

  // Move focus to the step's heading so keyboard and screen-reader users land in the dialog.
  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const timer = setTimeout(() => {
      try {
        (titleRef.current as unknown as { focus?: () => void } | null)?.focus?.();
      } catch {
        // Focus is a nicety; never fail the sheet over it.
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [open, scope]);

  const count = scope ? counts[scope] : 0;
  const title = scope ? CLEAR_COPY.confirmTitle(scope, count) : CLEAR_COPY.menuTitle;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(27,31,59,0.45)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
        <View
          accessibilityViewIsModal
          role={scope ? 'alertdialog' : 'dialog'}
          aria-modal
          aria-label={title}
          testID={scope ? 'clear-confirm' : 'clear-menu'}
          style={{
            width: '100%',
            maxWidth: layout.maxWidth,
            alignSelf: 'center',
            maxHeight: '90%',
            backgroundColor: colors.paper,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
          }}
        >
          <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.gap }}>
            <View ref={titleRef} focusable>
              <AppText variant="sectionTitle" bold accessibilityRole="header">
                {title}
              </AppText>
            </View>
            {scope ? (
              <>
                <AppText>{CLEAR_COPY.confirmBody(scope)}</AppText>
                {!online ? (
                  <AppText variant="secondary" color="danger" bold accessibilityRole="alert">
                    {offlineMessage}
                  </AppText>
                ) : null}
                <Button
                  label={CLEAR_COPY.confirmAction(count)}
                  disabled={!online || count === 0}
                  onPress={() => {
                    onConfirm(scope);
                    onClose();
                  }}
                />
                <Button label={CLEAR_COPY.back} kind="secondary" onPress={() => setScope(null)} />
                <Button label={CLEAR_COPY.cancel} kind="quiet" onPress={onClose} />
              </>
            ) : (
              <>
                <AppText color="muted">{CLEAR_COPY.menuBody}</AppText>
                {CLEAR_SCOPES.map((option) => (
                  <ScopeRow key={option} scope={option} count={counts[option]} onPress={() => setScope(option)} />
                ))}
                <Button label={CLEAR_COPY.cancel} kind="quiet" onPress={onClose} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ScopeRow({ scope, count, onPress }: { scope: ClearScope; count: number; onPress: () => void }) {
  const disabled = count === 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={CLEAR_COPY.optionA11y(scope, count)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: touch.min,
        paddingHorizontal: space.cardPadding,
        paddingVertical: 10,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        columnGap: space.gap,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <AppText bold>{scopeLabel(scope)}</AppText>
      <AppText variant="secondary" color="muted">
        {CLEAR_COPY.count(count)}
      </AppText>
    </Pressable>
  );
}
