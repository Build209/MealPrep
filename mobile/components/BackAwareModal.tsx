import { useEffect, useRef } from 'react';
import { Modal as NativeModal, Platform, type ModalProps } from 'react-native';
import { sheetBackStack } from '../lib/web/sheetBackStack';

/**
 * The app's Modal. Same as React Native's, plus on the web the phone's back button or back swipe
 * closes it (by calling `onRequestClose`) instead of leaving the app. Android already does this
 * for native apps; the web needs it done by hand. Use this for every sheet, dialog and menu.
 */
export function Modal(props: ModalProps) {
  const { visible, onRequestClose } = props;
  const closeRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    closeRef.current = onRequestClose as (() => void) | undefined;
  }, [onRequestClose]);

  const isOpen = visible !== false;
  const canClose = onRequestClose != null;
  useEffect(() => {
    if (Platform.OS !== 'web' || !isOpen || !canClose) return;
    const stack = sheetBackStack();
    if (!stack) return;
    return stack.register(() => closeRef.current?.());
  }, [canClose, isOpen]);

  return <NativeModal {...props} />;
}
