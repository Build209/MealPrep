/**
 * Phone: take or choose a photo with expo-image-picker and prepare it the way the old app does
 * (mobile/lib/pantryVision/prepareImage.ts): orient, shrink to 1536px, JPEG under 2.8 MB, and
 * refuse a blank frame (checked on a 128px copy decoded with jpeg-js). No zoomed crops on the
 * phone, as in the old app. The web version is pickPhoto.web.ts.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  computeLongEdgeResize,
  encodeUnderLimit,
  evaluateImageQuality,
  ImagePrepError,
  PHOTO_PREP,
  PREP_MESSAGES,
  rgbaToLuma,
  type PreparedImage,
} from './prepareShared';
import type { ScanKind } from './request';

export type PhotoSource = 'camera' | 'library';

async function qualityWarnings(uri: string): Promise<string[]> {
  const thumb = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 128 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!thumb.base64) return [];
  const { default: jpeg } = await import('jpeg-js');
  const binary = atob(thumb.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const decoded = jpeg.decode(bytes, { useTArray: true });
  const result = evaluateImageQuality(rgbaToLuma(decoded.data, decoded.width, decoded.height), decoded.width, decoded.height);
  if (result.blank) throw new ImagePrepError(PREP_MESSAGES.blank);
  return result.warnings;
}

export async function prepareUri(uri: string): Promise<PreparedImage> {
  const oriented = await ImageManipulator.manipulateAsync(uri, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG });
  const target = computeLongEdgeResize(oriented.width, oriented.height);
  const resize = oriented.width >= oriented.height ? { resize: { width: target.width } } : { resize: { height: target.height } };
  let lastUri = oriented.uri;
  const encoded = await encodeUnderLimit(async (quality) => {
    const result = await ImageManipulator.manipulateAsync(oriented.uri, [resize], {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    lastUri = result.uri;
    return result.base64 ?? '';
  });
  const warnings = await qualityWarnings(lastUri);
  return { uri: lastUri, mimeType: 'image/jpeg', base64: encoded.base64, byteLength: encoded.byteLength, qualityWarnings: warnings, detailTiles: [] };
}

/** Null when the person cancels. Throws ImagePrepError with a plain message when the camera is refused. */
export async function pickAndPreparePhoto(source: PhotoSource, _kind: ScanKind): Promise<PreparedImage | null> {
  const options = { allowsEditing: false, quality: PHOTO_PREP.jpegQuality };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new ImagePrepError(PREP_MESSAGES.cameraPermission);
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return prepareUri(asset.uri);
}
