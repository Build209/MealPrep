/**
 * Choose a saved cooking video, as the old app does (RecipeImportBox pickImportVideo): the photo
 * library on a phone, a file chooser in the browser (expo-image-picker does both). Null on cancel.
 */
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type PickedVideo = { uri: string; mimeType: string; name: string; size?: number };

export const VIDEO_PERMISSION_MESSAGE = 'Photo library access is needed to choose a video. Allow it in Settings and try again.';

export async function pickVideo(): Promise<PickedVideo | null> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error(VIDEO_PERMISSION_MESSAGE);
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false, quality: 1 });
  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'video/mp4',
    name: asset.fileName ?? `import-${Date.now()}.mp4`,
    size: asset.fileSize ?? undefined,
  };
}
