/**
 * Web: pick a photo with a file input (the phone browser offers the camera too) and prepare it
 * the way the old web app does (mobile/lib/pantryVision/prepareImage.web.ts): decode (HEIC via
 * heic2any when the browser cannot), shrink to 1536px, refuse a blank frame, JPEG under 2.8 MB,
 * plus zoomed crops of big photos.
 */
import {
  computeDetailTiles,
  computeLongEdgeResize,
  encodeUnderLimit,
  evaluateImageQuality,
  ImagePrepError,
  inferImageMimeType,
  inferImageMimeTypeFromHeader,
  isHeicMimeType,
  PHOTO_PREP,
  PREP_MESSAGES,
  rgbaToLuma,
  base64ByteLength,
  type PreparedImage,
  type PreparedTile,
  type TileLayout,
} from './prepareShared';
import type { ScanKind } from './request';

export type PhotoSource = 'camera' | 'library';

/** Gives up waiting for a choice after this long (some phone browsers never report a cancel). */
const PICKER_TIMEOUT_MS = 90_000;

/** Inputs appended to document.body are more reliable than ones inside the React Native Web tree. */
function pickFile(source: PhotoSource): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('data-testid', 'scan-file-input');
    if (source === 'camera') input.setAttribute('capture', 'environment');
    Object.assign(input.style, { position: 'fixed', left: '-10000px', top: '0', width: '1px', height: '1px', opacity: '0' });
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      input.remove();
      resolve(file);
    };
    const timer = window.setTimeout(() => finish(null), PICKER_TIMEOUT_MS);
    input.addEventListener('change', () => window.setTimeout(() => finish(input.files?.[0] ?? null), 0), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

async function resolveMimeType(file: File): Promise<string> {
  const declared = file.type?.trim().toLowerCase();
  if (declared && declared !== 'application/octet-stream' && declared !== 'image/*') return declared;
  const sniffed = inferImageMimeTypeFromHeader(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  return sniffed ?? inferImageMimeType(file);
}

async function toDecodableBlob(file: File, mimeType: string): Promise<Blob> {
  if (isHeicMimeType(mimeType)) {
    try {
      const { default: heic2any } = await import('heic2any');
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      const first = Array.isArray(converted) ? converted[0] : converted;
      if (first) return first;
    } catch {
      /* fall through: Safari can decode HEIC itself */
    }
  }
  if (!file.type || file.type === 'application/octet-stream' || file.type === 'image/*') return new Blob([file], { type: mimeType });
  return file;
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  const mimeType = await resolveMimeType(file);
  const blob = await toDecodableBlob(file, mimeType);
  try {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      return await createImageBitmap(blob);
    }
  } catch {
    throw new ImagePrepError(isHeicMimeType(mimeType) ? PREP_MESSAGES.heic : PREP_MESSAGES.unreadable);
  }
}

function canvasJpegBase64(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
}

/** Crops cut from the original (not the shrunk copy). Best effort: a crop that will not fit is left out. */
function encodeTiles(bitmap: ImageBitmap, layout: TileLayout): PreparedTile[] {
  const settings = PHOTO_PREP.detailTiles;
  const tiles: PreparedTile[] = [];
  try {
    for (const rect of computeDetailTiles(bitmap.width, bitmap.height, layout)) {
      const canvas = document.createElement('canvas');
      canvas.width = rect.targetWidth;
      canvas.height = rect.targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return [];
      ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.targetWidth, rect.targetHeight);
      let quality: number = settings.jpegQuality;
      let base64 = canvasJpegBase64(canvas, quality);
      while (base64ByteLength(base64) > settings.maxTileBytes && quality > 0.5) {
        quality -= 0.08;
        base64 = canvasJpegBase64(canvas, quality);
      }
      canvas.width = 0;
      canvas.height = 0;
      const byteLength = base64ByteLength(base64);
      if (!base64 || byteLength > settings.maxTileBytes) continue;
      tiles.push({ mimeType: 'image/jpeg', base64, byteLength, position: rect.position });
    }
  } catch {
    return [];
  }
  return tiles;
}

export async function prepareFile(file: File, kind: ScanKind): Promise<PreparedImage> {
  if (file.size <= 0) throw new ImagePrepError(PREP_MESSAGES.empty);
  const bitmap = await loadBitmap(file);
  const target = computeLongEdgeResize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImagePrepError(PREP_MESSAGES.encode);
  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  const detailTiles = encodeTiles(bitmap, kind === 'receipt' ? PHOTO_PREP.receiptTiles : PHOTO_PREP.detailTiles);
  bitmap.close?.();

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const quality = evaluateImageQuality(rgbaToLuma(data, canvas.width, canvas.height), canvas.width, canvas.height);
  if (quality.blank) throw new ImagePrepError(PREP_MESSAGES.blank);

  const encoded = await encodeUnderLimit((q) => canvasJpegBase64(canvas, q));
  return {
    uri: `data:image/jpeg;base64,${encoded.base64}`,
    mimeType: 'image/jpeg',
    base64: encoded.base64,
    byteLength: encoded.byteLength,
    qualityWarnings: quality.warnings,
    detailTiles,
  };
}

/** Null when the person closes the picker without choosing. */
export async function pickAndPreparePhoto(source: PhotoSource, kind: ScanKind): Promise<PreparedImage | null> {
  const file = await pickFile(source);
  if (!file) return null;
  return prepareFile(file, kind);
}
