#!/usr/bin/env node
// Lumen Kart — generates every icon / splash / PWA / store image from store/brand/icon.svg.
//
//   npm run assets            (node tools/generate-assets.mjs)
//
// Source of truth: store/brand/icon.svg, made of two layers:
//   <g id="background"> full-bleed sky, glow and speed streaks
//   <g id="foreground"> Lumen + kart wheel, kept within ~400 px of the centre (adaptive-icon safe zone)
// Outputs (all committed):
//   ios/App/App/Assets.xcassets/AppIcon.appiconset   1024 universal icon (Xcode derives every size), opaque
//   ios/App/App/Assets.xcassets/Splash.imageset      2732² launch image (scale-aspect-fill, centred art)
//   android/app/src/main/res/mipmap-*                legacy square/round icons + adaptive fg/bg layers
//   android/app/src/main/res/drawable*/splash.png    pre-Android-12 launch images (land + port)
//   public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, favicon.svg, favicon-32.png
//   store/brand/splash.svg, app-store-icon-1024.png, play-icon-512.png, play-feature-graphic.png
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BG = '#1f4f4c';
const source = readFileSync(join(root, 'store/brand/icon.svg'), 'utf8');

// ---------------------------------------------------------------- SVG layers
const fgStart = source.indexOf('<g id="foreground">');
const bgStart = source.indexOf('<g id="background">');
const end = source.lastIndexOf('</svg>');
if (fgStart < 0 || bgStart < 0 || bgStart > fgStart) throw new Error('icon.svg must contain <g id="background"> then <g id="foreground">');
const head = source.slice(0, bgStart);
const backgroundLayer = source.slice(bgStart, fgStart);
const foregroundLayer = source.slice(fgStart, end);
const defs = source.slice(source.indexOf('<defs>'), source.indexOf('</defs>') + 7);
const svgFull = source;
const svgBackground = head + backgroundLayer + '</svg>';
const svgForeground = head + foregroundLayer + '</svg>';

/** Foreground art centred on a canvas, art occupying `artSize` px. */
function centredArtSvg(width, height, artSize, { background = BG, glow = true } = {}) {
  const x = (width - artSize) / 2, y = (height - artSize) / 2;
  const s = artSize / 1024;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defs.replace('<defs>', `<defs><radialGradient id="splashGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#3b8a80"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></radialGradient>`)}
  <rect width="${width}" height="${height}" fill="${background}"/>
  ${glow ? `<circle cx="${width / 2}" cy="${height / 2}" r="${artSize * 0.75}" fill="url(#splashGlow)"/>` : ''}
  <g transform="translate(${x} ${y}) scale(${s})">${foregroundLayer.replace('<g id="foreground">', '<g>')}</g>
</svg>`;
}

const raster = (svg, size, density = 300) => sharp(Buffer.from(svg), { density }).resize(size, size);
const opaque = img => img.flatten({ background: BG }).removeAlpha();
const roundMask = size => Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
const roundedMask = (size, r) => Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`);

function out(rel) { const file = join(root, rel); mkdirSync(dirname(file), { recursive: true }); return file; }
const written = [];
async function save(rel, image) { await image.png({ compressionLevel: 9 }).toFile(out(rel)); written.push(rel); }

// ---------------------------------------------------------------- iOS
async function ios() {
  const set = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
  if (!existsSync(join(root, set))) { console.warn('skip iOS (no ios/ project)'); return; }
  for (const f of readdirSync(join(root, set))) if (f.endsWith('.png')) rmSync(join(root, set, f));
  // App Store rejects icons with alpha: flatten onto the brand colour.
  await save(`${set}/AppIcon-1024.png`, opaque(raster(svgFull, 1024)));
  writeFileSync(join(root, set, 'Contents.json'), JSON.stringify({
    images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  }, null, 2) + '\n');

  const splashSet = 'ios/App/App/Assets.xcassets/Splash.imageset';
  for (const f of readdirSync(join(root, splashSet))) if (f.endsWith('.png')) rmSync(join(root, splashSet, f));
  // 2732² centred art; LaunchScreen uses scaleAspectFill so the art (≤ 40 % of the short side) survives any crop.
  await save(`${splashSet}/splash-2732.png`, opaque(sharp(Buffer.from(centredArtSvg(2732, 2732, 820)), { density: 96 })));
  writeFileSync(join(root, splashSet, 'Contents.json'), JSON.stringify({
    images: [
      { idiom: 'universal', filename: 'splash-2732.png', scale: '1x' },
      { idiom: 'universal', filename: 'splash-2732.png', scale: '2x' },
      { idiom: 'universal', filename: 'splash-2732.png', scale: '3x' },
    ],
    info: { author: 'xcode', version: 1 },
  }, null, 2) + '\n');
}

// ---------------------------------------------------------------- Android
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SPLASH = { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] };
async function android() {
  const res = 'android/app/src/main/res';
  if (!existsSync(join(root, res))) { console.warn('skip Android (no android/ project)'); return; }
  for (const [density, scale] of Object.entries(DENSITIES)) {
    const dir = `${res}/mipmap-${density}`;
    for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png', 'ic_launcher_background.png', 'ic_launcher.webp', 'ic_launcher_round.webp', 'ic_launcher_foreground.webp']) {
      if (existsSync(join(root, dir, f))) rmSync(join(root, dir, f));
    }
    const adaptive = Math.round(108 * scale), legacy = Math.round(48 * scale);
    // Adaptive layers: 108 dp. Foreground art scaled to 74 dp so its ~400 px art radius (≈29 dp) sits inside the 33 dp safe circle.
    const fgArt = Math.round(adaptive * 74 / 108);
    const fg = await raster(svgForeground, fgArt).png().toBuffer();
    await save(`${dir}/ic_launcher_foreground.png`,
      sharp({ create: { width: adaptive, height: adaptive, channels: 4, background: '#00000000' } }).composite([{ input: fg, gravity: 'centre' }]));
    await save(`${dir}/ic_launcher_background.png`, opaque(raster(svgBackground, adaptive)));
    // Legacy (API 24–25) square icon with rounded corners, and the round variant.
    const full = await opaque(raster(svgFull, legacy)).png().toBuffer();
    await save(`${dir}/ic_launcher.png`, sharp(full).ensureAlpha().composite([{ input: roundedMask(legacy, legacy * 0.18), blend: 'dest-in' }]));
    await save(`${dir}/ic_launcher_round.png`, sharp(full).ensureAlpha().composite([{ input: roundMask(legacy), blend: 'dest-in' }]));
  }
  // Pre-Android-12 launch images (Android 12+ uses windowSplashScreenAnimatedIcon = adaptive foreground).
  for (const [density, [w, h]] of Object.entries(SPLASH)) {
    const art = Math.round(Math.min(w, h) * 0.62);
    await save(`${res}/drawable-land-${density}/splash.png`, opaque(sharp(Buffer.from(centredArtSvg(w, h, art)), { density: 96 })));
    await save(`${res}/drawable-port-${density}/splash.png`, opaque(sharp(Buffer.from(centredArtSvg(h, w, art)), { density: 96 })));
  }
  await save(`${res}/drawable/splash.png`, opaque(sharp(Buffer.from(centredArtSvg(480, 320, 176)), { density: 96 })));
}

// ---------------------------------------------------------------- Web / PWA
async function web() {
  await save('public/icon-192.png', opaque(raster(svgFull, 192)));
  await save('public/icon-512.png', opaque(raster(svgFull, 512)));
  // Maskable: art within the 80 % safe circle.
  await save('public/icon-maskable-512.png', opaque(sharp(Buffer.from(centredArtSvg(512, 512, 400, { glow: true })), { density: 96 })));
  await save('public/apple-touch-icon.png', opaque(raster(svgFull, 180)));
  const full32 = await opaque(raster(svgFull, 32)).png().toBuffer();
  await save('public/favicon-32.png', sharp(full32).ensureAlpha().composite([{ input: roundedMask(32, 7), blend: 'dest-in' }]));
  // SVG favicon: the full icon with rounded corners.
  const favicon = svgFull
    .replace(/<title>[\s\S]*?<\/title>/, '<title>Lumen Kart</title>')
    .replace('<defs>', '<defs><clipPath id="corner"><rect width="1024" height="1024" rx="224"/></clipPath>')
    .replace('<g id="background">', '<g clip-path="url(#corner)"><g id="background">')
    .replace(/<\/svg>\s*$/, '</g></svg>\n');
  writeFileSync(out('public/favicon.svg'), favicon); written.push('public/favicon.svg');
}

// ---------------------------------------------------------------- Store
async function store() {
  writeFileSync(out('store/brand/splash.svg'), centredArtSvg(2732, 2732, 820) + '\n'); written.push('store/brand/splash.svg');
  await save('store/brand/app-store-icon-1024.png', opaque(raster(svgFull, 1024)));
  await save('store/brand/play-icon-512.png', opaque(raster(svgFull, 512)));
  // Google Play feature graphic 1024×500: sky + streaks, Lumen on the right third (no text, per Play guidance).
  const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
    ${defs}
    <g transform="translate(0 -262)">${backgroundLayer.replace('<g id="background">', '<g>')}</g>
    <g transform="translate(560 18) scale(0.45)">${foregroundLayer.replace('<g id="foreground">', '<g>')}</g>
  </svg>`;
  await save('store/brand/play-feature-graphic.png', opaque(sharp(Buffer.from(feature), { density: 96 }).resize(1024, 500)));
}

await ios();
await android();
await web();
await store();
console.log(`Lumen Kart assets: ${written.length} files written.`);
for (const f of written) console.log('  ' + f);
