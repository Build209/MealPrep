/**
 * Forky pinned in the top bar (owner's decision, 2026-10-10): fixed place where the round logo
 * was, no dragging, clouds open under him and fold away to two think bubbles.
 *
 * Run from mobile/: npm run test:forky-pinned
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_COLUMN_MAX_WIDTH_PX,
  appColumnSideInset,
  FORKINATOR_CLOUD_AUTO_COLLAPSE_MS,
  FORKINATOR_PINNED_HEIGHT_PX,
  FORKINATOR_PINNED_HIT_HEIGHT_PX,
  FORKINATOR_PINNED_HIT_WIDTH_PX,
  FORKINATOR_PINNED_LEFT_PX,
  FORKINATOR_PINNED_TOP_PX,
  FORKINATOR_PINNED_WIDTH_PX,
  APP_TOP_BAR_HEIGHT_PX,
  forkinatorThinkDots,
  isForkinatorTabRoute,
  pinnedForkinatorPosition,
  resolvePinnedForkinatorTap,
} from '../lib/forkinator/pinnedDock';
import { layoutScannerPrompt } from '../lib/forkinator/scannerPromptLayout';
import { FORKINATOR_HEIGHT_PX, FORKINATOR_WIDTH_PX } from '../lib/forkinator/position';

const HEADER_HEIGHT_PX = 64;
const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// --- Size and place ---
assert.ok(FORKINATOR_PINNED_HEIGHT_PX < FORKINATOR_HEIGHT_PX * 0.7, 'smaller than the floating Forky');
assert.ok(
  Math.abs(FORKINATOR_PINNED_WIDTH_PX / FORKINATOR_PINNED_HEIGHT_PX - FORKINATOR_WIDTH_PX / FORKINATOR_HEIGHT_PX) < 0.02,
  'same proportions as the artwork',
);
const phone = pinnedForkinatorPosition(390);
assert.deepEqual(phone, { x: FORKINATOR_PINNED_LEFT_PX, y: FORKINATOR_PINNED_TOP_PX });
const feet = phone.y + FORKINATOR_PINNED_HEIGHT_PX;
assert.ok(feet > HEADER_HEIGHT_PX && feet - HEADER_HEIGHT_PX <= 16, 'his feet hang a little below the bar');
assert.ok(phone.x + FORKINATOR_PINNED_WIDTH_PX <= 46, 'he fits in the space the logo left, before the wordmark');
// The app column is centred on a wide screen; Forky stays at the column's left edge, not the window's.
assert.equal(appColumnSideInset(390), 0);
assert.equal(appColumnSideInset(1280), (1280 - APP_COLUMN_MAX_WIDTH_PX) / 2);
assert.equal(pinnedForkinatorPosition(1280).x, (1280 - APP_COLUMN_MAX_WIDTH_PX) / 2 + FORKINATOR_PINNED_LEFT_PX);
assert.ok(FORKINATOR_PINNED_HIT_WIDTH_PX >= 44 && FORKINATOR_PINNED_HIT_HEIGHT_PX >= 44, 'tap target at least 44px');

// --- Only on the tab screens ---
for (const route of ['/', '/index', '/(tabs)', '/grocery', '/pantry', '/recipes', '/stores', '/profile', '/admin', '/(tabs)/pantry']) {
  assert.equal(isForkinatorTabRoute(route), true, route);
}
for (const route of ['/smart-shop', '/discover-recipes', '/discover-recipes/abc', '/delete-account', '/pantry-staples', '/preview/video-recipe-detail']) {
  assert.equal(isForkinatorTabRoute(route), false, route);
}

// --- Clouds open under him, never over the bar ---
for (const [screenWidth, screenHeight] of [[360, 640], [390, 844], [1280, 800]] as const) {
  const side = appColumnSideInset(screenWidth);
  const position = pinnedForkinatorPosition(screenWidth);
  const layout = layoutScannerPrompt({
    mascotX: position.x,
    mascotY: position.y,
    mascotWidth: FORKINATOR_PINNED_WIDTH_PX,
    mascotHeight: FORKINATOR_PINNED_HEIGHT_PX,
    preferBelow: true,
    screenWidth,
    screenHeight,
    insetTop: 0,
    insetRight: side,
    insetBottom: 0,
    insetLeft: side,
    message: 'Your spinach expires tomorrow. Want to see it?',
    includeActionButton: true,
  });
  assert.equal(layout.placement, 'below');
  assert.ok(layout.top >= position.y + FORKINATOR_PINNED_HEIGHT_PX, 'cloud starts under his feet');
  assert.ok(layout.top > HEADER_HEIGHT_PX, 'cloud is clear of the top bar');
  assert.ok(layout.left >= side && layout.left + layout.width <= screenWidth - side, 'cloud stays inside the app column');
  // The tail points at him: it starts under his body, not under the middle of the cloud.
  const tailCenter = layout.left + (layout.tailOffsetX ?? -999) + 5;
  assert.ok(tailCenter >= position.x && tailCenter <= position.x + FORKINATOR_PINNED_WIDTH_PX + 6, 'tail under Forky');
}

// --- Think bubbles sit beside him inside the bar, never over the page that scrolls under it ---
const dots = forkinatorThinkDots(phone);
assert.equal(dots.length, 2);
assert.ok(dots[0].size < dots[1].size, 'bubbles grow away from him');
for (const dot of dots) {
  assert.ok(dot.left >= phone.x + FORKINATOR_PINNED_WIDTH_PX, 'beside him, not on top of him');
  assert.ok(dot.left + dot.size <= phone.x - 10 + FORKINATOR_PINNED_HIT_WIDTH_PX, 'inside his tap target');
  assert.ok(dot.top + dot.size <= FORKINATOR_PINNED_HIT_HEIGHT_PX + phone.y, 'inside his tap target');
  assert.ok(dot.top + dot.size <= APP_TOP_BAR_HEIGHT_PX, 'inside the top bar, not over the page');
}
assert.ok(FORKINATOR_CLOUD_AUTO_COLLAPSE_MS >= 6000 && FORKINATOR_CLOUD_AUTO_COLLAPSE_MS <= 15000, 'long enough to read and tap a button');

// --- What a tap does ---
const base = { promptShowing: false, cloudOpen: false, forkInRoadPromptVisible: false, forkInRoadExpanded: false, askForkyAvailable: false };
assert.equal(resolvePinnedForkinatorTap({ ...base, promptShowing: true }), 'reopenCloud', 'folded cloud opens again');
assert.equal(resolvePinnedForkinatorTap({ ...base, promptShowing: true, askForkyAvailable: true }), 'reopenCloud');
assert.equal(resolvePinnedForkinatorTap({ ...base, promptShowing: true, cloudOpen: true }), 'default', 'open cloud: usual tap');
assert.equal(resolvePinnedForkinatorTap({ ...base, forkInRoadPromptVisible: true }), 'openForkInRoadCloud');
assert.equal(resolvePinnedForkinatorTap({ ...base, forkInRoadPromptVisible: true, forkInRoadExpanded: true }), 'default');
assert.equal(
  resolvePinnedForkinatorTap({ ...base, forkInRoadPromptVisible: true, askForkyAvailable: true }),
  'default',
  'where Ask Forky is on, a tap on Home opens the chat (it has its own "Help me pick")',
);
assert.equal(resolvePinnedForkinatorTap(base), 'default');

// --- Wiring ---
const overlay = read('components/forkinator/ForkinatorOverlay.tsx');
assert.doesNotMatch(overlay, /PanResponder|onPointerMove|writeForkinatorPosition|readForkinatorPosition/, 'no dragging, no saved position');
assert.match(overlay, /pinnedForkinatorPosition\(width, insets\.left\)/);
assert.match(overlay, /isForkinatorTabRoute\(pathname\)/);
assert.equal((overlay.match(/preferBelow: true,/g) ?? []).length, 6, 'every cloud opens under him');
assert.match(overlay, /setTimeout\(\(\) => setCloudOpen\(false\), FORKINATOR_CLOUD_AUTO_COLLAPSE_MS\)/, 'clouds fold away by themselves');
assert.match(overlay, /thinkDotsVisible/);
assert.doesNotMatch(overlay, /<ForkInRoadPrompt\b/, 'the always-on "Can\'t decide?" pill is gone');
assert.match(overlay, /<Pressable\s+onPress=\{handleMascotActivate\}/);
const logo = read('components/BrandLogo.tsx');
const headerVariant = logo.slice(logo.indexOf("variant === 'header'"), logo.indexOf('return (\n    <View className="items-center py-2"'.replace(/\n/g, logo.includes('\r\n') ? '\r\n' : '\n')));
assert.doesNotMatch(headerVariant, /<Image/, 'the round fork mark is gone from the bar: Forky stands there');
assert.match(headerVariant, /FORKINATOR_PINNED_WIDTH_PX/, 'the bar keeps his spot free');
assert.match(logo, /logoFullTransparent/, 'the sign-in sheet keeps the full logo');
const overlays = read('components/AppOverlays.tsx');
assert.match(overlays, /FORKY_LAYER_Z_INDEX = 9000/, 'Forky sits under open sheets (z-index 9999 on the web)');

// The green "Can't decide?" card is gone from Home (owner, 2026-10-10): Forky in the bar is the way in.
const home = read('app/(tabs)/index.tsx');
assert.doesNotMatch(home, /FORKINATOR_FORK_IN_ROAD_HOME_CARD_MESSAGE|requestForkInRoadQuiz|FORKY_CARD_IMAGE/);
assert.match(overlay, /label: FORKINATOR_FORK_IN_ROAD_BUTTON_LABEL,/, 'the quiz is still reachable from his cloud');

console.log('forky-pinned-check: ok');
