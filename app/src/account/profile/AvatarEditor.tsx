import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useChangeAvatar } from '../../data/profileMutations';
import { OFFLINE_MESSAGE, useIsOnline } from '../../data/online';
import { DataError } from '../../data/errors';
import { colors, radius, space } from '../../theme/tokens';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { PROFILE_COPY as COPY } from '../copy';
import { Avatar } from './Avatar';
import { PRESET_AVATARS, parseAvatarPath, presetPath } from './avatar';
import { AvatarPhotoError, pickAvatarPhoto } from './pickAvatarPhoto';

/** The picture at the top of the profile: upload a photo, pick a built-in avatar, or remove it. */
export function AvatarEditor({ avatarPath, name, email }: { avatarPath: string | null; name: string; email: string }) {
  const change = useChangeAvatar();
  const online = useIsOnline();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<{ text: string; error: boolean } | null>(null);
  const current = parseAvatarPath(avatarPath);
  const hasAvatar = current.kind !== 'none';

  async function run(work: () => Promise<string>) {
    if (busy) return;
    if (!online) {
      setLine({ text: COPY.photoOffline, error: true });
      return;
    }
    setBusy(true);
    setLine({ text: COPY.photoWorking, error: false });
    try {
      setLine({ text: await work(), error: false });
    } catch (error) {
      if (error instanceof AvatarPhotoError) setLine({ text: error.message, error: true });
      else if (error instanceof DataError && error.kind === 'offline') setLine({ text: COPY.photoOffline, error: true });
      else setLine({ text: COPY.photoFailed, error: true });
    } finally {
      setBusy(false);
    }
  }

  const upload = () =>
    run(async () => {
      const bytes = await pickAvatarPhoto();
      if (!bytes) return '';
      await change.mutateAsync({ kind: 'upload', bytes, currentPath: avatarPath });
      setPicking(false);
      return COPY.photoSaved;
    });
  const choose = (key: string) =>
    run(async () => {
      await change.mutateAsync({ kind: 'preset', path: presetPath(key), currentPath: avatarPath });
      setPicking(false);
      return COPY.photoSaved;
    });
  const remove = () =>
    run(async () => {
      await change.mutateAsync({ kind: 'remove', currentPath: avatarPath });
      setPicking(false);
      return COPY.avatarRemoved;
    });

  return (
    <View style={{ gap: space.gap }} testID="avatar-editor">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.gap }}>
        <View accessible accessibilityRole="image" accessibilityLabel={COPY.avatarLabel}>
          <Avatar path={avatarPath} name={name} email={email} size={72} testID="account-avatar" />
        </View>
        <View style={{ flex: 1, gap: 4, alignItems: 'flex-start' }}>
          <Button label={COPY.uploadPhoto} kind="secondary" onPress={upload} disabled={busy} testID="avatar-upload" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button
          label={picking ? COPY.closePresets : hasAvatar ? COPY.changePreset : COPY.choosePreset}
          kind="secondary"
          onPress={() => setPicking((p) => !p)}
          disabled={busy}
          testID="avatar-choose"
        />
        {hasAvatar ? (
          <Button
            label={current.kind === 'photo' ? COPY.removePhoto : COPY.removeAvatar}
            kind="quiet"
            onPress={remove}
            disabled={busy}
            testID="avatar-remove"
          />
        ) : null}
      </View>

      {picking ? (
        <View accessibilityLabel={COPY.presetTitle} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} testID="avatar-presets">
          {PRESET_AVATARS.map((preset) => {
            const selected = current.kind === 'preset' && current.preset.key === preset.key;
            return (
              <Pressable
                key={preset.key}
                onPress={() => choose(preset.key)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={COPY.presetOption(preset.label)}
                accessibilityState={{ selected, disabled: busy }}
                testID={`avatar-preset-${preset.key}`}
                hitSlop={2}
                style={({ pressed }) => ({
                  width: 52,
                  height: 52,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: selected ? colors.ink : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Avatar path={presetPath(preset.key)} size={44} />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!online && !line ? (
        <AppText variant="secondary" color="muted">
          {OFFLINE_MESSAGE}
        </AppText>
      ) : null}
      {line && line.text ? (
        <AppText
          variant="secondary"
          color={line.error ? 'danger' : 'muted'}
          bold={line.error}
          accessibilityRole={line.error ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
          testID="avatar-status"
        >
          {line.text}
        </AppText>
      ) : null}
    </View>
  );
}
