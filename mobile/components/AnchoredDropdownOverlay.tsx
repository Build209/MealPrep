import { type ReactNode, useCallback, useRef, useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  type LayoutChangeEvent,
  type View as RNView,
} from 'react-native';
import { Modal } from './BackAwareModal';

export type AnchorRect = { x: number; y: number; width: number; height: number };

const MENU_GAP_PX = 4;

type AnchoredDropdownOverlayProps = {
  visible: boolean;
  anchor: AnchorRect | null;
  onClose: () => void;
  children: ReactNode;
  minWidth?: number;
  maxWidth?: number;
};

export function AnchoredDropdownOverlay({
  visible,
  anchor,
  onClose,
  children,
  minWidth = 132,
  maxWidth = 240,
}: AnchoredDropdownOverlayProps) {
  const { width: windowWidth } = useWindowDimensions();
  const menuMaxWidth = Math.min(maxWidth, windowWidth - 16);

  if (!visible || !anchor) {
    return null;
  }

  const top = anchor.y + anchor.height + MENU_GAP_PX;
  const right = Math.max(8, windowWidth - (anchor.x + anchor.width));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu">
        <Pressable
          onPress={(event) => event.stopPropagation()}
          className="overflow-hidden rounded-xl border border-border bg-paper shadow-sm"
          style={{
            position: 'absolute',
            top,
            right,
            minWidth,
            maxWidth: menuMaxWidth,
            elevation: 12,
            zIndex: 1000,
          }}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function useAnchoredDropdownTrigger() {
  const triggerRef = useRef<RNView>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);

  const measureAnchor = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }, []);

  const openMenu = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    if (open) {
      closeMenu();
      return;
    }
    openMenu();
  }, [closeMenu, open, openMenu]);

  const onTriggerLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      if (open) {
        measureAnchor();
      }
    },
    [measureAnchor, open],
  );

  return {
    triggerRef,
    open,
    anchor,
    openMenu,
    closeMenu,
    toggleMenu,
    onTriggerLayout,
  };
}
