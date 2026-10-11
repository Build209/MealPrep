import { Ionicons } from '../lib/icons/Ionicons';
import { useEffect } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { THEME } from '../config/appConfig';
import { PANTRY_SCAN_UI_COPY } from '../config/pantryScan';
import { scanCardContent } from '../lib/pantry/scanCardContent';
import { useTutorialTarget } from '../hooks/useTutorial';
import type { PantryPhotoScanGateInput } from '../lib/guest/pantryPhotoScanGate';
import type { PhotoScanAccessInput } from '../lib/plans/photoScanAccess';
import type { PreparedPantryImage } from '../lib/pantryVision/types';
import type { PantryStorageLocation } from '../config/pantryStorage';
import type { Session } from '@supabase/supabase-js';

export interface PantryStorageScanButtonsProps {
  disabled?: boolean;
  /** Web: block photo pickers and show guest sign-in prompt instead. */
  guestPhotoScanBlocked?: boolean;
  /** Web: session restore in progress — avoid treating signed-in users as guests. */
  authPhotoScanPending?: boolean;
  photoScanGate?: PantryPhotoScanGateInput;
  photoScanAccess?: PhotoScanAccessInput;
  contextSession?: Session | null;
  onPrepareError?: (message: string) => void;
  onImagePrepared: (location: PantryStorageLocation, prepared: PreparedPantryImage) => void;
  onRequestNativeScan: (location: PantryStorageLocation, source: 'camera' | 'library') => void;
  onRequestSignIn?: () => void;
  scanLocation: PantryStorageLocation;
  /** One-shot: open source menu or launch camera when pantry focuses. */
  autoOpenScanMode?: 'menu' | 'camera' | null;
  onAutoOpenScanHandled?: () => void;
  /** Show the "Plus" badge on the scan card (user is not on the paid plan yet). */
  showPlusBadge?: boolean;
  /** Replaces the "Plus" badge text, e.g. "3 free" for a free account with free scans left. */
  badgeText?: string;
  /** 'receipt' shows the receipt card and prepares the photo as a tall receipt. Default 'shelf'. */
  variant?: 'shelf' | 'receipt';
}

export function PantryStorageScanButtons({
  disabled,
  onRequestNativeScan,
  scanLocation,
  autoOpenScanMode,
  onAutoOpenScanHandled,
  showPlusBadge,
  badgeText,
  variant = 'shelf',
}: PantryStorageScanButtonsProps) {
  const card = scanCardContent(variant);
  // The first-time tour lights this card up.
  const tutorialRef = useTutorialTarget(variant === 'receipt' ? 'pantry-receipt' : 'pantry-scan');
  function openSourceMenu() {
    Alert.alert(PANTRY_SCAN_UI_COPY.choosePhotoSourceTitle, PANTRY_SCAN_UI_COPY.choosePhotoSourceMessage, [
      {
        text: PANTRY_SCAN_UI_COPY.takePhoto,
        onPress: () => onRequestNativeScan(scanLocation, 'camera'),
      },
      {
        text: PANTRY_SCAN_UI_COPY.chooseFromLibrary,
        onPress: () => onRequestNativeScan(scanLocation, 'library'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  useEffect(() => {
    if (!autoOpenScanMode || disabled) return;
    onAutoOpenScanHandled?.();
    if (autoOpenScanMode === 'camera') {
      onRequestNativeScan(scanLocation, 'camera');
      return;
    }
    openSourceMenu();
  }, [autoOpenScanMode, disabled, onAutoOpenScanHandled, onRequestNativeScan, scanLocation]);

  return (
    <View ref={tutorialRef}>
      <Pressable
        disabled={disabled}
        onPress={openSourceMenu}
        className={`min-h-[44px] flex-row items-center gap-3 rounded-[20px] border-[1.5px] border-tomato bg-card p-3.5 ${
          disabled ? 'opacity-50' : ''
        }`}
        accessibilityRole="button"
        accessibilityLabel={card.a11y}
      >
        <View className="h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tomato-light">
          <Ionicons name={card.icon} size={24} color={THEME.tomatoDark} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-extrabold text-ink">{card.title}</Text>
          <Text className="mt-0.5 text-sm leading-5 text-muted">{card.subtitle}</Text>
        </View>
        {showPlusBadge || badgeText ? (
          <View className={`shrink-0 rounded-[10px] px-[9px] py-1 ${badgeText ? 'bg-ink' : 'bg-tomato'}`}>
            <Text className={`text-xs font-extrabold ${badgeText ? 'text-banana' : 'text-on-tomato'}`}>
              {badgeText ?? PANTRY_SCAN_UI_COPY.scanCardPlusBadge}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
