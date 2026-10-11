#!/usr/bin/env node
/**
 * Generates PWA icons and manifest.webmanifest into public/ before web export.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');
const publicDir = path.join(mobileRoot, 'public');
const iconsDir = path.join(publicDir, 'icons');
const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'));
const brand = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'config', 'appBrand.json'), 'utf8'));

const baseUrl = appJson.expo?.experiments?.baseUrl ?? '';
const basePath = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

const themeColors = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, 'config', 'theme.colors.json'), 'utf8'),
);

const THEME = {
  banana: themeColors.banana,
  paper: themeColors.paper,
  brandCream: themeColors.brandCream,
};
const APP_NAME = brand.name;
const APP_SHORT_NAME = brand.shortName;
const PWA_DESCRIPTION = brand.pwaDescription;

function webPath(relative) {
  const normalized = relative.startsWith('/') ? relative : `/${relative}`;
  return `${basePath}${normalized}`;
}

async function generateIcons(sourceIcon, maskableIcon) {
  fs.mkdirSync(iconsDir, { recursive: true });

  const sizes = [
    { name: 'icon-192.png', size: 192, maskable: false },
    { name: 'icon-512.png', size: 512, maskable: false },
    { name: 'apple-touch-icon.png', size: 180, maskable: false },
    { name: 'icon-maskable-192.png', size: 192, maskable: true },
    { name: 'icon-maskable-512.png', size: 512, maskable: true },
  ];

  for (const { name, size, maskable } of sizes) {
    const out = path.join(iconsDir, name);
    if (maskable) {
      await sharp(maskableIcon).resize(size, size, { fit: 'cover' }).png().toFile(out);
    } else {
      await sharp(sourceIcon).resize(size, size, { fit: 'cover' }).png().toFile(out);
    }
  }
}

function writeManifest() {
  const manifest = {
    id: webPath('/'),
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: PWA_DESCRIPTION,
    start_url: webPath('/'),
    scope: webPath('/'),
    display: 'standalone',
    orientation: 'portrait',
    theme_color: THEME.banana,
    background_color: THEME.paper,
    share_target: {
      action: webPath('/?import=1'),
      method: 'GET',
      enctype: 'application/x-www-form-urlencoded',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
      },
      // No `files` entry: browsers only deliver shared files over POST multipart, which this GET
      // target cannot receive. Links and text still share in. Add file sharing back together
      // with a POST handler in the service worker.
    },
    icons: [
      { src: webPath('/icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: webPath('/icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: webPath('/icons/icon-maskable-192.png'),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: webPath('/icons/icon-maskable-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const sourceIcon = path.join(mobileRoot, brand.assets.icon);
  if (!fs.existsSync(sourceIcon)) {
    throw new Error(`Missing source icon: ${sourceIcon}`);
  }
  const maskableIcon = path.join(mobileRoot, brand.assets.iconMaskable);
  if (!fs.existsSync(maskableIcon)) {
    throw new Error(`Missing maskable icon: ${maskableIcon}`);
  }
  await generateIcons(sourceIcon, maskableIcon);
  writeManifest();
  console.log('PWA icons and manifest written to public/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
