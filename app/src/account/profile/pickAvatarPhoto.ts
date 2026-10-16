/**
 * Choose a picture from the device and shrink it for the avatars bucket (jpeg, 512px, under 900 KB;
 * the bucket's own limit is 1 MB). Uses expo-image-picker and expo-image-manipulator, the same two
 * packages the scan feature already uses, on phone and web alike. Returns null when the person cancels.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { PROFILE_COPY } from '../copy';
import { AVATAR_EDGE, AVATAR_MAX_BYTES } from './avatar';

export class AvatarPhotoError extends Error {}

const QUALITIES = [0.8, 0.65, 0.5, 0.35];

export async function pickAvatarPhoto(): Promise<ArrayBuffer | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  for (const quality of QUALITIES) {
    let bytes: ArrayBuffer;
    try {
      const shrunk = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: AVATAR_EDGE } }], {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      bytes = await (await fetch(shrunk.uri)).arrayBuffer();
    } catch {
      throw new AvatarPhotoError(PROFILE_COPY.photoUnreadable);
    }
    if (bytes.byteLength > 0 && bytes.byteLength <= AVATAR_MAX_BYTES) return bytes;
  }
  throw new AvatarPhotoError(PROFILE_COPY.photoTooBig);
}
