#!/usr/bin/env node
// Lumen Kart — checks store metadata limits and release identity before an upload.
//   node tools/validate-store.mjs            (CI, see .github/workflows/verify.yml)
//   node tools/validate-store.mjs --release  (before submitting: placeholders must be filled)
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(join(root, rel), 'utf8');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const length = text => [...text.trim()].length;

// App Store Connect and Google Play limits (characters).
const LIMITS = {
  'name.txt': 30,               // App Store name and Play title
  'subtitle.txt': 30,           // App Store subtitle
  'short_description.txt': 80,  // Play short description
  'keywords.txt': 100,          // App Store keywords
  'promotional_text.txt': 170,  // App Store promotional text
  'description.txt': 4000,      // App Store description
  'full_description.txt': 4000, // Play full description
  'release_notes.txt': 500,     // Play "What's new" (App Store allows 4000)
};
for (const lang of ['fr-FR', 'en-US']) {
  for (const [file, max] of Object.entries(LIMITS)) {
    const rel = `store/metadata/${lang}/${file}`;
    if (!existsSync(join(root, rel))) { problems.push(`missing ${rel}`); continue; }
    const text = read(rel);
    check(length(text) > 0, `${rel} is empty`);
    check(length(text) <= max, `${rel}: ${length(text)} > ${max} characters`);
  }
  const keywords = read(`store/metadata/${lang}/keywords.txt`).trim();
  check(!/,\s/.test(keywords), `store/metadata/${lang}/keywords.txt: no spaces after commas (wastes characters)`);
  check(!/nintendo|mario|kart\s*8/i.test(read(`store/metadata/${lang}/keywords.txt`) + read(`store/metadata/${lang}/description.txt`)),
    `store/metadata/${lang}: third-party trademarks in keywords/description are rejected by both stores`);
}

// Identity must agree everywhere.
const pkg = JSON.parse(read('package.json'));
const cap = JSON.parse(read('capacitor.config.json'));
check(pkg.name === 'lumen-kart', 'package.json name must be lumen-kart');
check(cap.appId === 'com.omartrabelsi.lumenkart', 'capacitor appId must be com.omartrabelsi.lumenkart');
check(cap.appName === 'Lumen Kart', 'capacitor appName must be "Lumen Kart"');
if (existsSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'))) {
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  check(pbx.includes(`MARKETING_VERSION = ${pkg.version};`), `iOS MARKETING_VERSION must equal package.json version ${pkg.version}`);
  check(pbx.includes('PRODUCT_BUNDLE_IDENTIFIER = com.omartrabelsi.lumenkart;'), 'iOS bundle id mismatch');
  const plist = read('ios/App/App/Info.plist');
  check(!/UIInterfaceOrientationPortrait/.test(plist), 'iOS Info.plist must be landscape only');
  check(plist.includes('<key>NSMotionUsageDescription</key>'), 'iOS NSMotionUsageDescription missing');
}
if (existsSync(join(root, 'android/app/src/main/AndroidManifest.xml'))) {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  check(manifest.includes('android:screenOrientation="sensorLandscape"'), 'Android activity must be sensorLandscape');
  const allowed = new Set(['android.permission.INTERNET']);
  for (const [, permission] of manifest.matchAll(/uses-permission android:name="([^"]+)"/g)) {
    check(allowed.has(permission), `unexpected Android permission ${permission}`);
  }
  const gradle = read('android/variables.gradle');
  const target = Number(/targetSdkVersion = (\d+)/.exec(gradle)?.[1]);
  check(target >= 35, `Android targetSdkVersion ${target} < 35 (Google Play requirement)`);
}
// --release: final gate before submitting (placeholders must be filled in).
if (process.argv.includes('--release')) {
  check(!read('store/privacy-policy.md').includes('CONTACT_EMAIL'), 'store/privacy-policy.md still contains the CONTACT_EMAIL placeholder');
}

if (problems.length) {
  console.error('Store validation failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Store metadata OK (fr-FR, en-US) — ${pkg.name} ${pkg.version}, ${cap.appId}`);
