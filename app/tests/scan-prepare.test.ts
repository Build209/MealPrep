/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../src/scan/prepareShared';

test('same numbers as the old app (PHOTO_SCAN in mobile/config/appConfig.ts)', () => {
  assert.equal(PHOTO_PREP.maxImageDimension, 1536);
  assert.equal(PHOTO_PREP.jpegQuality, 0.82);
  assert.equal(PHOTO_PREP.maxPayloadBytes, 2_800_000);
  assert.deepEqual([PHOTO_PREP.detailTiles.columns, PHOTO_PREP.detailTiles.rows], [2, 2]);
  assert.deepEqual([PHOTO_PREP.receiptTiles.columns, PHOTO_PREP.receiptTiles.rows], [1, 3]);
});

test('long edge shrinks to 1536, keeping the shape; small photos stay', () => {
  assert.deepEqual(computeLongEdgeResize(4032, 3024), { width: 1536, height: 1152 });
  assert.deepEqual(computeLongEdgeResize(3024, 4032), { width: 1152, height: 1536 });
  assert.deepEqual(computeLongEdgeResize(800, 600), { width: 800, height: 600 });
});

test('detail tiles: 2x2 overlapping grid for a big shelf, 3 strips for a receipt, none for small photos', () => {
  const grid = computeDetailTiles(4000, 3000);
  assert.deepEqual(grid.map((t) => t.position), ['top left', 'top right', 'bottom left', 'bottom right']);
  assert.ok(grid.every((t) => Math.max(t.targetWidth, t.targetHeight) <= 1280));
  assert.ok(grid[0]!.width > 2000, 'tiles overlap past the middle');
  const strips = computeDetailTiles(1500, 4000, PHOTO_PREP.receiptTiles);
  assert.deepEqual(strips.map((t) => t.position), ['top', 'middle', 'bottom']);
  assert.deepEqual(computeDetailTiles(2000, 1500), []);
});

test('encode loop steps quality down until it fits, then refuses', async () => {
  const tried: number[] = [];
  // A fake encoder whose output shrinks with quality.
  const encode = (q: number) => {
    tried.push(Math.round(q * 100) / 100);
    return 'A'.repeat(Math.round(q * 1000));
  };
  const fit = await encodeUnderLimit(encode, { maxBytes: 500 });
  assert.deepEqual(tried, [0.82, 0.76, 0.7, 0.64]);
  assert.ok(fit.byteLength <= 500);
  await assert.rejects(encodeUnderLimit(encode, { maxBytes: 10 }), (e: unknown) => e instanceof ImagePrepError && e.message === PREP_MESSAGES.tooLarge);
  await assert.rejects(encodeUnderLimit(() => ''), ImagePrepError);
});

function lumaImage(width: number, height: number, pixel: (x: number, y: number) => number): Float32Array {
  const luma = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) luma[y * width + x] = pixel(x, y);
  return luma;
}

test('quality: a uniform frame is blank; a checkerboard passes; dark gets a hint', () => {
  assert.equal(evaluateImageQuality(lumaImage(64, 64, () => 0.5), 64, 64).blank, true);
  const board = evaluateImageQuality(lumaImage(64, 64, (x, y) => ((x >> 3) + (y >> 3)) % 2), 64, 64);
  assert.equal(board.blank, false);
  assert.deepEqual(board.warnings, []);
  const dark = evaluateImageQuality(lumaImage(64, 64, (x, y) => (((x >> 3) + (y >> 3)) % 2) * 0.1), 64, 64);
  assert.ok(dark.warnings.includes(PREP_MESSAGES.tooDark));
  // Big images are judged on a small copy.
  assert.equal(evaluateImageQuality(lumaImage(1000, 500, (x, y) => ((x >> 4) + (y >> 4)) % 2), 1000, 500).blank, false);
});

test('rgba to luma', () => {
  const luma = rgbaToLuma([255, 255, 255, 255, 0, 0, 0, 255], 2, 1);
  assert.ok(Math.abs(luma[0]! - 1) < 1e-6);
  assert.equal(luma[1], 0);
});

test('file types: from name, from first bytes, HEIC', () => {
  assert.equal(inferImageMimeType({ name: 'IMG_1.HEIC', type: '' }), 'image/heic');
  assert.equal(inferImageMimeType({ name: 'x', type: 'application/octet-stream' }), 'image/jpeg');
  assert.equal(inferImageMimeType({ name: 'a.png', type: 'image/webp' }), 'image/webp');
  assert.equal(inferImageMimeTypeFromHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(inferImageMimeTypeFromHeader(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), 'image/png');
  const heic = new Uint8Array([0, 0, 0, 0x18, ...'ftypheic'.split('').map((c) => c.charCodeAt(0))]);
  assert.equal(inferImageMimeTypeFromHeader(heic), 'image/heic');
  assert.equal(inferImageMimeTypeFromHeader(new Uint8Array([1, 2, 3])), null);
  assert.ok(isHeicMimeType('IMAGE/HEIF'));
});
