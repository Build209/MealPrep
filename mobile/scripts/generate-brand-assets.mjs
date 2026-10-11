#!/usr/bin/env node
/**
 * Generates Expo / Android / in-app brand assets from the two source images in
 * assets/brand/: the fork mascot cut-out and the "fork + MealPlanatic" logo.
 * Paths, colors and the mascot's placement on the icon are in config/appBrand.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');
const brandPath = path.join(mobileRoot, 'config', 'appBrand.json');
const brand = JSON.parse(fs.readFileSync(brandPath, 'utf8'));

const mascotPath = path.join(mobileRoot, brand.sourceMascot);
const logoPath = path.join(mobileRoot, brand.sourceLogo);
for (const source of [mascotPath, logoPath]) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing brand source image: ${source}`);
  }
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const creamRgb = hexToRgb(brand.colors.brandCream);
const iconBgRgb = hexToRgb(brand.colors.iconBackground);
/** Width of the sticker's white die-cut ring, as a fraction of the icon size. */
const STICKER_RING_RATIO = 0.024;

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function assetOut(relative) {
  return path.join(mobileRoot, relative);
}

function canvas(size, background) {
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  });
}

/**
 * Square canvas with the mascot's face and tines in view and the handle
 * running off the bottom edge. `placement` is in fractions of the canvas size.
 * `sticker` ({ cx, cy, r } in fractions) draws the banana sticker disc with its
 * white die-cut ring behind the mascot (owner's choice, 2026-10-11: green tile,
 * Forky on a yellow sticker).
 */
async function mascotSquare(size, background, placement, { silhouette = false, sticker = null } = {}) {
  const left = Math.round(size * placement.left);
  const top = Math.round(size * placement.top);
  const width = Math.round(size * placement.width);
  const resized = await sharp(mascotPath).resize({ width }).png().toBuffer();
  const meta = await sharp(resized).metadata();
  const height = Math.min(meta.height, size - top);
  let overlay = await sharp(resized).extract({ left: 0, top: 0, width, height }).png().toBuffer();
  if (silhouette) {
    const alpha = await sharp(overlay).extractChannel('alpha').toBuffer();
    overlay = await sharp({
      create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .joinChannel(alpha)
      .png()
      .toBuffer();
  }
  const layers = [];
  if (sticker) {
    const cx = size * sticker.cx;
    const cy = size * sticker.cy;
    const r = size * sticker.r;
    const ring = size * STICKER_RING_RATIO;
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${brand.colors.iconStickerRing}"/>` +
          `<circle cx="${cx}" cy="${cy}" r="${r - ring}" fill="${brand.colors.iconSticker}"/>` +
          `</svg>`,
      ),
      left: 0,
      top: 0,
    });
  }
  layers.push({ input: overlay, left, top });
  return canvas(size, background).composite(layers).png().toBuffer();
}

/** Whole mascot, centered on a transparent square. */
async function mascotContained(size, contentScale = 0.9) {
  const inner = Math.round(size * contentScale);
  const resized = await sharp(mascotPath).resize(inner, inner, { fit: 'inside' }).png().toBuffer();
  return canvas(size, TRANSPARENT)
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function roundedCorners(buffer, size, radiusRatio) {
  const radius = Math.round(size * radiusRatio);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`,
  );
  return sharp(buffer)
    .resize(size, size)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** Logo with name on brand cream, with a margin around it. */
async function logoOnCream(logoBuffer, marginRatio = 0.08) {
  const meta = await sharp(logoBuffer).metadata();
  const margin = Math.round(meta.width * marginRatio);
  return sharp(logoBuffer)
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: TRANSPARENT })
    .flatten({ background: creamRgb })
    .png()
    .toBuffer();
}

async function main() {
  const iconPlacement = brand.iconMascot;
  /** Android masks the outer third of adaptive layers, so keep the face inside it. */
  const adaptivePlacement = { left: 0.3, top: 0.2, width: 0.4 };
  /** Header mark is shown inside a small circle. */
  const markPlacement = { left: 0.2, top: 0.08, width: 0.6 };

  /** Launchers crop maskable icons to a circle, so the face sits further in. */
  const maskablePlacement = { left: 0.27, top: 0.14, width: 0.46 };

  /** Sticker discs: full icon, the maskable safe circle, and Android's inner two thirds. */
  const iconSticker = { cx: 0.5, cy: 0.46, r: 0.37 };
  const maskableSticker = { cx: 0.5, cy: 0.5, r: 0.3 };
  const adaptiveSticker = { cx: 0.5, cy: 0.5, r: 0.27 };

  const icon1024 = await mascotSquare(1024, { ...iconBgRgb, alpha: 1 }, iconPlacement, { sticker: iconSticker });
  const iconMaskable = await mascotSquare(1024, { ...iconBgRgb, alpha: 1 }, maskablePlacement, {
    sticker: maskableSticker,
  });
  const splash512 = await mascotContained(512, 0.9);
  const markHeader = await mascotSquare(84, { ...creamRgb, alpha: 1 }, markPlacement);

  const androidFg = await mascotSquare(1024, TRANSPARENT, adaptivePlacement, { sticker: adaptiveSticker });
  const androidBg = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: iconBgRgb },
  })
    .png()
    .toBuffer();
  const androidMono = await mascotSquare(1024, TRANSPARENT, adaptivePlacement, { silhouette: true });

  const favicon = await roundedCorners(icon1024, 48, 0.22);

  const logoTransparent = await sharp(logoPath).resize({ width: 1040 }).png().toBuffer();
  const logoFull = await logoOnCream(logoTransparent);

  const writes = [
    [brand.assets.icon, icon1024],
    [brand.assets.iconMaskable, iconMaskable],
    [brand.assets.splashIcon, splash512],
    [brand.assets.favicon, favicon],
    [brand.assets.androidIconForeground, androidFg],
    [brand.assets.androidIconBackground, androidBg],
    [brand.assets.androidIconMonochrome, androidMono],
    [brand.assets.logoFull, logoFull],
    [brand.assets.logoFullTransparent, logoTransparent],
    [brand.assets.logoMark, markHeader],
  ];

  for (const [relative, buffer] of writes) {
    const out = assetOut(relative);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sharp(buffer).toFile(out);
    console.log('wrote', relative);
  }

  console.log('Brand assets generated from', brand.sourceMascot, 'and', brand.sourceLogo);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
