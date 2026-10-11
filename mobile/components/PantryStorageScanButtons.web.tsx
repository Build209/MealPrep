import { Ionicons } from '../lib/icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { THEME } from '../config/appConfig';
import { GUEST_MODE_COPY } from '../config/guestMode';
import { PANTRY_SCAN_UI_COPY } from '../config/pantryScan';
import { resolvePhotoScanAccess } from '../lib/guest/resolvePhotoScanAccess';
import { resolvePhotoScanSession } from '../lib/guest/resolvePhotoScanSession';
import { photoScanAccessUserMessage } from '../lib/plans/photoScanAccess';
import { PantryImageQualityError } from '../lib/pantryVision/prepareImageShared';
import { pickWebImageFile } from '../lib/web/pickWebImageFile';
import { PhotoScanPlusUpgradeCard } from './PhotoScanPlusUpgradeCard';
import { scanCardContent } from '../lib/pantry/scanCardContent';
import { useTutorialTarget } from '../hooks/useTutorial';
import type { PantryStorageScanButtonsProps } from './PantryStorageScanButtons';

export function PantryStorageScanButtons({
  disabled,
  guestPhotoScanBlocked,
  authPhotoScanPending,
  onPrepareError,
  onImagePrepared,
  photoScanGate,
  photoScanAccess,
  contextSession,
  onRequestSignIn,
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
  const [guestGateOpen, setGuestGateOpen] = useState(false);
  const [plusGateOpen, setPlusGateOpen] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);

  const pickersDisabled = Boolean(disabled || pickerBusy);

  async function runGateCheck(): Promise<boolean> {
    if (photoScanAccess) {
      const resolved = await resolvePhotoScanAccess(photoScanAccess, contextSession ?? null);
      if (resolved.access !== 'allowed') {
        const copy = photoScanAccessUserMessage(resolved.access);
        if (resolved.access === 'guest_blocked') {
          setGuestGateOpen(true);
          return false;
        }
        if (resolved.access === 'plan_blocked') {
          setPlusGateOpen(true);
          return false;
        }
        if (copy) {
          onPrepareError?.(copy.message);
        }
        return false;
      }
      return true;
    }
    if (photoScanGate) {
      const resolved = await resolvePhotoScanSession(photoScanGate, contextSession ?? null);
      if (resolved.gate === 'auth_loading') {
        onPrepareError?.(GUEST_MODE_COPY.pantryScanAuthLoading);
        return false;
      }
      if (resolved.gate === 'guest_blocked') {
        setGuestGateOpen(true);
        return false;
      }
      return true;
    }
    if (authPhotoScanPending) {
      onPrepareError?.(GUEST_MODE_COPY.pantryScanAuthLoading);
      return false;
    }
    if (guestPhotoScanBlocked) {
      setGuestGateOpen(true);
      return false;
    }
    return true;
  }

  async function onPressPicker(source: 'camera' | 'library') {
    setSourceMenuOpen(false);
    if (disabled) return;
    const allowed = await runGateCheck();
    if (!allowed) return;

    setPickerBusy(true);
    try {
      const file = await pickWebImageFile(
        source === 'camera' ? { capture: 'environment' } : undefined,
      );
      if (!file) return;
      const { preparePantryImageFromFile } = await import('../lib/pantryVision/prepareImage.web');
      const prepared = await preparePantryImageFromFile(file, {
        detailTiles: variant === 'receipt' ? 'receipt' : true,
      });
      onImagePrepared(scanLocation, prepared);
    } catch (error: unknown) {
      if (error instanceof PantryImageQualityError && error.reason === 'blank') {
        onPrepareError?.(error.message);
        return;
      }
      const message = error instanceof Error ? error.message : 'Could not prepare photo';
      onPrepareError?.(message);
    } finally {
      setPickerBusy(false);
    }
  }

  async function onPressScanShelf() {
    if (disabled) return;
    const allowed = await runGateCheck();
    if (!allowed) return;
    setSourceMenuOpen(true);
  }

  useEffect(() => {
    if (!autoOpenScanMode || disabled) return;
    onAutoOpenScanHandled?.();
    void (async () => {
      const allowed = await runGateCheck();
      if (!allowed) return;
      setSourceMenuOpen(true);
    })();
  }, [autoOpenScanMode, disabled, onAutoOpenScanHandled]);

  return (
    <View ref={tutorialRef}>
      {authPhotoScanPending ? (
        <Text className="mb-2 text-xs text-muted">{GUEST_MODE_COPY.pantryScanAuthLoading}</Text>
      ) : null}

      <Pressable
        disabled={pickersDisabled}
        onPress={() => void onPressScanShelf()}
        className={`min-h-[44px] flex-row items-center gap-3 rounded-[20px] border-[1.5px] border-tomato bg-card p-3.5 ${
          pickersDisabled ? 'opacity-50' : ''
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

      {sourceMenuOpen ? (
        <View className="mt-2 rounded-[18px] border border-border bg-card p-3">
          <Text className="mb-2 text-center text-xs font-semibold text-muted">
            {PANTRY_SCAN_UI_COPY.choosePhotoSourceMessage}
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              disabled={pickersDisabled}
              onPress={() => void onPressPicker('camera')}
              className={`min-h-[44px] flex-1 items-center justify-center rounded-full px-3 ${pickersDisabled ? 'opacity-40' : 'bg-primary'}`}
              accessibilityLabel={PANTRY_SCAN_UI_COPY.takePhoto}
            >
              <Text className="text-center text-sm font-bold text-cream">
                {PANTRY_SCAN_UI_COPY.takePhoto}
              </Text>
            </Pressable>
            <Pressable
              disabled={pickersDisabled}
              onPress={() => void onPressPicker('library')}
              className={`min-h-[44px] flex-1 items-center justify-center rounded-full border border-border px-3 ${pickersDisabled ? 'opacity-40' : 'bg-card'}`}
              accessibilityLabel={PANTRY_SCAN_UI_COPY.chooseFromLibrary}
            >
              <Text className="text-center text-sm font-bold text-ink">
                {PANTRY_SCAN_UI_COPY.chooseFromLibrary}
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => setSourceMenuOpen(false)}
            className="mt-1 min-h-[44px] items-center justify-center"
            accessibilityRole="button"
          >
            <Text className="text-center text-sm font-semibold text-muted">Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {guestGateOpen ? (
        <View className="mt-2 rounded-[18px] border border-primary bg-primary-light px-4 py-4">
          <Text className="text-sm font-bold text-ink">{GUEST_MODE_COPY.pantryScanSignInTitle}</Text>
          <Text className="mt-1 text-sm leading-5 text-muted">{GUEST_MODE_COPY.pantryScanSignIn}</Text>
          <View className="mt-3 flex-row gap-2">
            <Pressable
              onPress={() => onRequestSignIn?.()}
              className="min-h-[44px] flex-1 items-center justify-center rounded-full bg-primary px-4"
            >
              <Text className="text-sm font-bold text-on-primary">{GUEST_MODE_COPY.pantryScanSignInCta}</Text>
            </Pressable>
            <Pressable
              onPress={() => setGuestGateOpen(false)}
              className="min-h-[44px] items-center justify-center rounded-full border border-border bg-card px-4"
            >
              <Text className="text-sm font-semibold text-muted">Not now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {plusGateOpen ? <PhotoScanPlusUpgradeCard onDismiss={() => setPlusGateOpen(false)} /> : null}
    </View>
  );
}
