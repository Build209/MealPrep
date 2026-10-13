/**
 * The pure parts of photo preparation, ported from the old app (mobile/config/appConfig.ts
 * PHOTO_SCAN, mobile/lib/pantryVision/prepareImageShared.ts, mobile/lib/web/inferImageMimeType.ts)
 * with the same numbers, so the live pantry-vision function gets the photos it was tuned for.
 * No React, DOM or Expo here (tests/scan-prepare.test.ts). The platform files
 * (prepareImage.ts, prepareImage.web.ts) do the decoding and encoding.
 */

export const PHOTO_PREP = {
  /** Long edge sent to pantry-vision (phone and web use the same rule). */
  maxImageDimension: 1536,
  /** Small label text turns to mush below about 0.8. */
  jpegQuality: 0.82,
  /** The function refuses over 4 MB; stay well under. */
  maxPayloadBytes: 2_800_000,
  /** Re-encode at lower quality in these steps, down to this floor, until the photo fits. */
  qualityStep: 0.06,
  qualityFloor: 0.42,
  /** Zoomed crops of a big shelf photo, sent with it (web only, as in the old app). */
  detailTiles: {
    minSourceLongEdge: 2200,
    columns: 2,
    rows: 2,
    overlap: 0.12,
    maxLongEdge: 1280,
    jpegQuality: 0.82,
    maxTileBytes: 900_000,
  },
  /** Receipts are tall and narrow: full-width strips, top to bottom, instead of a grid. */
  receiptTiles: {
    minSourceLongEdge: 2200,
    columns: 1,
    rows: 3,
    overlap: 0.12,
    maxLongEdge: 1280,
  },
  /** Quality hints are worked out on a small copy, not the full upload. */
  qualityAnalysisLongEdge: 256,
  minMeanLuminance: 0.12,
  /** Soft blur hint: mean squared Laplacian on 0-1 luma (sharp phone photos are often 0.03 to 0.08). */
  minLaplacianVariance: 0.008,
  /** A uniform frame is refused before anything is sent. */
  minLuminanceStdDev: 0.01,
  blankLaplacianVariance: 1e-6,
} as const;

export const PREP_MESSAGES = {
  tooDark: 'This photo looks too dark. Turn on more light and try again.',
  tooBlurry: 'This photo looks blurry. Hold steady and tap to focus, then try again.',
  blank: 'This photo looks blank. Try another picture with your food in frame.',
  tooLarge: 'Photo is still too large after resizing. Try a closer crop.',
  empty: 'That photo file looks empty. Try picking it again.',
  unreadable: 'Could not load that image. Try a JPG or PNG.',
  heic: 'Could not load that HEIC photo. Try JPG or PNG, or turn off HEIC in camera settings.',
  encode: 'Could not prepare the photo for upload. Try another one.',
  cameraPermission: 'Camera access is needed to scan. Turn it on in Settings and try again.',
} as const;

/** A photo ready to send: base64 JPEG plus what pantry-vision accepts alongside it. */
export type PreparedImage = {
  /** Local preview address (not uploaded). */
  uri: string;
  mimeType: 'image/jpeg';
  base64: string;
  byteLength: number;
  /** Non-blocking hints (too dark, blurry); the scan still runs. */
  qualityWarnings: string[];
  /** Zoomed crops of the same photo (web, big photos only). */
  detailTiles: PreparedTile[];
};

export type PreparedTile = { mimeType: 'image/jpeg'; base64: string; byteLength: number; position: string };

/** The photo was refused before sending (blank frame). `message` is for people. */
export class ImagePrepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImagePrepError';
  }
}

export function computeLongEdgeResize(
  width: number,
  height: number,
  maxLongEdge: number = PHOTO_PREP.maxImageDimension,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = maxLongEdge / longEdge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Bytes a base64 string decodes to, the way the old app counted them. */
export function base64ByteLength(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Encode at the starting quality, then step down until the photo fits (old app's loop).
 * Throws ImagePrepError when even the floor quality is too big.
 */
export async function encodeUnderLimit(
  encode: (quality: number) => Promise<string> | string,
  options: { startQuality?: number; maxBytes?: number } = {},
): Promise<{ base64: string; byteLength: number; quality: number }> {
  const maxBytes = options.maxBytes ?? PHOTO_PREP.maxPayloadBytes;
  let quality = options.startQuality ?? PHOTO_PREP.jpegQuality;
  let base64 = await encode(quality);
  if (!base64) throw new ImagePrepError(PREP_MESSAGES.encode);
  let byteLength = base64ByteLength(base64);
  while (byteLength > maxBytes && quality > PHOTO_PREP.qualityFloor) {
    quality -= PHOTO_PREP.qualityStep;
    base64 = await encode(quality);
    if (!base64) throw new ImagePrepError(PREP_MESSAGES.encode);
    byteLength = base64ByteLength(base64);
  }
  if (byteLength > maxBytes) throw new ImagePrepError(PREP_MESSAGES.tooLarge);
  return { base64, byteLength, quality };
}

// ------------------------------------------------------------------ detail tiles

export type TileLayout = { minSourceLongEdge: number; columns: number; rows: number; overlap: number; maxLongEdge: number };

export type TileRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
  /** "top left", "bottom right", ...: the only words the function passes on to the model. */
  position: string;
};

function tilePositionLabel(row: number, rows: number, column: number, columns: number): string {
  const vertical = rows === 1 ? '' : row === 0 ? 'top' : row === rows - 1 ? 'bottom' : 'middle';
  const horizontal = columns === 1 ? '' : column === 0 ? 'left' : column === columns - 1 ? 'right' : 'centre';
  return [vertical, horizontal].filter(Boolean).join(' ') || 'full';
}

/** Overlapping crops covering the whole photo; none when the original is too small to gain detail. */
export function computeDetailTiles(sourceWidth: number, sourceHeight: number, layout: TileLayout = PHOTO_PREP.detailTiles): TileRect[] {
  const width = Math.floor(sourceWidth);
  const height = Math.floor(sourceHeight);
  const columns = Math.max(1, Math.floor(layout.columns));
  const rows = Math.max(1, Math.floor(layout.rows));
  if (!(width > 0) || !(height > 0)) return [];
  if (Math.max(width, height) < layout.minSourceLongEdge) return [];
  if (columns * rows < 2) return [];

  const overlap = Math.min(0.4, Math.max(0, layout.overlap));
  const cellW = width / columns;
  const cellH = height / rows;
  const padX = columns > 1 ? cellW * overlap : 0;
  const padY = rows > 1 ? cellH * overlap : 0;

  const tiles: TileRect[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = Math.max(0, Math.floor(column * cellW - padX));
      const top = Math.max(0, Math.floor(row * cellH - padY));
      const right = Math.min(width, Math.ceil((column + 1) * cellW + padX));
      const bottom = Math.min(height, Math.ceil((row + 1) * cellH + padY));
      const target = computeLongEdgeResize(right - left, bottom - top, layout.maxLongEdge);
      tiles.push({
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        targetWidth: target.width,
        targetHeight: target.height,
        position: tilePositionLabel(row, rows, column, columns),
      });
    }
  }
  return tiles;
}

// ---------------------------------------------------------------- photo quality

export type QualityEvaluation = {
  meanLuminance: number;
  laplacianVariance: number;
  luminanceStdDev: number;
  /** Set when the frame is uniform: refuse before sending. */
  blank: boolean;
  warnings: string[];
};

/** 0-1 luma from RGBA pixels (canvas ImageData or a decoded JPEG). */
export function rgbaToLuma(data: ArrayLike<number>, width: number, height: number): Float32Array {
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i + 2 < data.length && p < luma.length; i += 4, p += 1) {
    luma[p] = (0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0)) / 255;
  }
  return luma;
}

export function downsampleLuma(
  luma: Float32Array,
  width: number,
  height: number,
  maxLongEdge: number = PHOTO_PREP.qualityAnalysisLongEdge,
): { luma: Float32Array; width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxLongEdge) return { luma, width, height };
  const scale = maxLongEdge / long;
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));
  const out = new Float32Array(tw * th);
  for (let y = 0; y < th; y += 1) {
    for (let x = 0; x < tw; x += 1) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / tw));
      const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / th));
      out[y * tw + x] = luma[sy * width + sx] ?? 0;
    }
  }
  return { luma: out, width: tw, height: th };
}

export function luminanceStdDev(luma: Float32Array): number {
  const n = luma.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += luma[i] ?? 0;
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = (luma[i] ?? 0) - mean;
    varSum += d * d;
  }
  return Math.sqrt(varSum / n);
}

export function laplacianVariance(luma: Float32Array, width: number, height: number): number {
  const at = (i: number) => luma[i] ?? 0;
  let lapSum = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const lap = -4 * at(idx) + at(idx - 1) + at(idx + 1) + at(idx - width) + at(idx + width);
      lapSum += lap * lap;
      lapCount += 1;
    }
  }
  return lapCount > 0 ? lapSum / lapCount : 0;
}

/** Brightness and blur hints, and the blank-frame refusal, on a small copy of the photo. */
export function evaluateImageQuality(luma: Float32Array, width: number, height: number): QualityEvaluation {
  const sampled = downsampleLuma(luma, width, height);
  const n = sampled.luma.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += sampled.luma[i] ?? 0;
  const meanLuminance = n > 0 ? sum / n : 0.5;
  const stdDev = luminanceStdDev(sampled.luma);
  const lapVar = laplacianVariance(sampled.luma, sampled.width, sampled.height);

  const warnings: string[] = [];
  if (meanLuminance < PHOTO_PREP.minMeanLuminance) warnings.push(PREP_MESSAGES.tooDark);
  if (lapVar < PHOTO_PREP.minLaplacianVariance) warnings.push(PREP_MESSAGES.tooBlurry);
  const blank = stdDev < PHOTO_PREP.minLuminanceStdDev || lapVar < PHOTO_PREP.blankLaplacianVariance;
  return { meanLuminance, laplacianVariance: lapVar, luminanceStdDev: stdDev, blank, warnings };
}

// ------------------------------------------------------------------- file types

/** MIME type from a file, falling back to its extension when the browser leaves it empty. */
export function inferImageMimeType(file: { name: string; type: string }): string {
  const trimmed = file.type?.trim().toLowerCase();
  if (trimmed && trimmed !== 'application/octet-stream' && trimmed !== 'image/*') return trimmed;
  const base = file.name.split(/[/\\]/).pop() ?? file.name;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : '';
  switch (ext) {
    case 'heic':
    case 'heif':
      return 'image/heic';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

/** Sniff the first bytes when name and type are unreliable (Android picks). */
export function inferImageMimeTypeFromHeader(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) {
    return 'image/webp';
  }
  if (bytes.length >= 12 && String.fromCharCode(b(4), b(5), b(6), b(7)) === 'ftyp') {
    const brand = String.fromCharCode(b(8), b(9), b(10), b(11)).toLowerCase();
    if (brand.startsWith('heic') || brand.startsWith('heif') || brand === 'mif1' || brand === 'msf1') return 'image/heic';
  }
  return null;
}

export function isHeicMimeType(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return m === 'image/heic' || m === 'image/heif';
}
