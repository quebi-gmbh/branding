#!/usr/bin/env node
// Validates the dist/ build output. Runs in CI after build + package.
//
// Checks:
//  - dist/ exists and contains manifest.json
//  - every file listed in the manifest exists and matches its recorded
//    sha256 + byte length (guards against corruption & non-determinism)
//  - the expected deliverables are all present (SVG sources, ICO, apple/
//    android icons, webmanifest, readme.html)
//  - PNG sizes listed in tokens.json are all generated
//  - favicon.ico parses as a multi-image ICO with the expected count
//  - if quebi-branding.zip is present, it's non-trivially sized

import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.error(`  ✗ ${m}`); failed++; };
const skip = (m) => console.log(`  ○ ${m}`);
const section = (t) => console.log(`\n${t}`);

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `pnpm run build` first');
  process.exit(1);
}

const manifestPath = join(DIST, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('dist/manifest.json missing');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const tokens = JSON.parse(readFileSync(join(ROOT, 'src/tokens.json'), 'utf8'));

section('Manifest integrity');
let manifestErrors = 0;
for (const f of manifest.files) {
  const p = join(DIST, f.path);
  if (!existsSync(p)) { fail(`missing: ${f.path}`); manifestErrors++; continue; }
  const buf = readFileSync(p);
  if (buf.length !== f.bytes) { fail(`${f.path}: expected ${f.bytes} bytes, got ${buf.length}`); manifestErrors++; continue; }
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== f.sha256) { fail(`${f.path}: sha256 mismatch`); manifestErrors++; }
}
if (manifestErrors === 0) ok(`${manifest.files.length} files match recorded sha256 + bytes`);

section('Expected deliverables');
const EXPECTED = [
  'readme.html',
  'manifest.json',
  'svg/q-light.svg',
  'svg/q-dark.svg',
  'svg/lockup-light.svg',
  'svg/lockup-dark.svg',
  'svg/lockup-light-outlined.svg',
  'svg/lockup-dark-outlined.svg',
  'favicon/favicon.ico',
  'favicon/favicon-16.png',
  'favicon/favicon-32.png',
  'favicon/apple-touch-icon.png',
  'favicon/android-chrome-192.png',
  'favicon/android-chrome-512.png',
  'favicon/site.webmanifest',
];
for (const rel of EXPECTED) {
  existsSync(join(DIST, rel)) ? ok(rel) : fail(`missing: ${rel}`);
}

section('PNG size coverage');
for (const size of tokens.exports.png_sizes_px) {
  const variants = [];
  for (const v of ['light', 'dark']) {
    variants.push(`q-${v}-${size}.png`, `q-${v}-${size}-on-light.png`, `q-${v}-${size}-on-dark.png`);
  }
  if (size >= 180) variants.push(`lockup-light-${size}.png`, `lockup-dark-${size}.png`);
  for (const v of variants) {
    existsSync(join(DIST, 'png', v)) ? ok(v) : fail(`missing: png/${v}`);
  }
}

section('ICO structure');
const ico = readFileSync(join(DIST, 'favicon/favicon.ico'));
// ICO header: reserved (2B, 0), type (2B, 1=icon), count (2B, LE)
if (ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0) {
  const count = ico[4] | (ico[5] << 8);
  const need = tokens.exports.favicon_ico_sizes.length;
  count >= need
    ? ok(`favicon.ico contains ${count} images (≥ ${need} required)`)
    : fail(`favicon.ico has only ${count} images, expected ≥ ${need}`);
} else {
  fail('favicon.ico: invalid ICO header');
}

section('webmanifest');
try {
  const wm = JSON.parse(readFileSync(join(DIST, 'favicon/site.webmanifest'), 'utf8'));
  wm.name && wm.icons?.length >= 2 ? ok(`webmanifest valid (${wm.icons.length} icons)`) : fail('webmanifest missing name/icons');
} catch (e) { fail(`webmanifest parse error: ${e.message}`); }

section('Package zip');
import { readdirSync } from 'node:fs';
const zips = readdirSync(ROOT).filter((n) => n.startsWith('quebi-branding-') && n.endsWith('.zip'));
if (zips.length === 0) {
  skip('no quebi-branding-*.zip present — run `pnpm run package` to create');
} else {
  for (const z of zips) {
    const s = statSync(join(ROOT, z));
    s.size > 50_000 ? ok(`${z} = ${(s.size / 1024).toFixed(1)} KB`) : fail(`${z} suspiciously small: ${s.size} bytes`);
  }
}

console.log();
if (failed === 0) {
  console.log('✓ all checks passed');
  process.exit(0);
} else {
  console.log(`✗ ${failed} check(s) failed`);
  process.exit(1);
}
