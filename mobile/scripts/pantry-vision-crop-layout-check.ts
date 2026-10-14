/**
 * Crop layout checks for the old app's photo scan (client side, pure). Split out of the
 * pantry-vision handler check when the function checks moved to supabase/scripts/.
 * Run from mobile/: npm run test:pantry-vision-gemini
 */
import assert from 'node:assert/strict';
import { computeDetailTiles } from '../lib/pantryVision/prepareImageShared';
import { PHOTO_SCAN } from '../config/appConfig';

// --- Crop layout (client side, pure) ---
const portrait = computeDetailTiles(3072, 4080);
assert.equal(portrait.length, 4);
assert.deepEqual(portrait.map((t) => t.position), ['top left', 'top right', 'bottom left', 'bottom right']);
for (const t of portrait) {
  assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.width <= 3072 && t.y + t.height <= 4080, 'crop stays inside the photo');
  assert.ok(Math.max(t.targetWidth, t.targetHeight) <= PHOTO_SCAN.detailTiles.maxLongEdge);
  assert.ok(Math.abs(t.targetWidth / t.targetHeight - t.width / t.height) < 0.01, 'aspect ratio kept');
}
// Together the crops cover every pixel, and neighbours overlap.
assert.equal(Math.min(...portrait.map((t) => t.x)), 0);
assert.equal(Math.min(...portrait.map((t) => t.y)), 0);
assert.equal(Math.max(...portrait.map((t) => t.x + t.width)), 3072);
assert.equal(Math.max(...portrait.map((t) => t.y + t.height)), 4080);
assert.ok(portrait[0].x + portrait[0].width > portrait[1].x + 100, 'left and right crops overlap');
assert.ok(portrait[0].y + portrait[0].height > portrait[2].y + 100, 'top and bottom crops overlap');
// Each crop shows labels at well over the main image's scale.
const mainScale = PHOTO_SCAN.maxImageDimension / 4080;
assert.ok(portrait[0].targetHeight / portrait[0].height > mainScale * 1.3, 'crops carry more detail than the main image');
// Small originals get no crops: nothing extra to show.
assert.deepEqual(computeDetailTiles(1600, 1200), []);
assert.deepEqual(computeDetailTiles(0, 0), []);
assert.equal(computeDetailTiles(4080, 3072).length, 4, 'landscape works too');
assert.ok(PHOTO_SCAN.detailTiles.columns * PHOTO_SCAN.detailTiles.rows <= 4, 'client never sends more crops than the server accepts');
// Receipts are tall: three full-width strips, top to bottom.
const strips = computeDetailTiles(3072, 4080, PHOTO_SCAN.receiptTiles);
assert.deepEqual(strips.map((t) => t.position), ['top', 'middle', 'bottom']);
assert.ok(strips.every((t) => t.x === 0 && t.width === 3072), 'strips span the full width');
assert.equal(strips[0].y, 0);
assert.equal(strips[2].y + strips[2].height, 4080);
assert.ok(strips[0].y + strips[0].height > strips[1].y + 100 && strips[1].y + strips[1].height > strips[2].y + 100, 'strips overlap so no line is lost on a seam');
assert.ok(PHOTO_SCAN.receiptTiles.columns * PHOTO_SCAN.receiptTiles.rows <= 4);

console.log('OK: pantry-vision crop layout checks passed');
