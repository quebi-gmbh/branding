#!/usr/bin/env node
// quebi brand asset build pipeline.
//
// - Outlines the Outfit text in the lockup/wordmark SVGs via opentype.js so
//   all downstream rasterisation is font-independent.
// - Rasterises PNGs via @resvg/resvg-js (deterministic, no headless browser).
// - Builds favicon.ico with png-to-ico, squircle'd app icons with sharp.
// - Renders vector PDFs via pdfkit + svg-to-pdfkit.
// - Emits manifest.json (sha256, w/h, bytes) and a preview contact sheet.
//
// Usage:  node scripts/build.mjs [--clean]

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get as httpsGet } from 'node:https';

import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';
import { optimize as svgoOptimize } from 'svgo';
import { loadFont, outlineLockup } from './outline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const FONT_PATH = join(SRC, 'fonts/Outfit-Light.ttf');
const FONT_URL = 'https://github.com/Outfitio/Outfit-Fonts/raw/main/fonts/ttf/Outfit-Light.ttf';

const tokens = JSON.parse(readFileSync(join(SRC, 'tokens.json'), 'utf8'));
const SURFACE_DARK = tokens.colors.surface;
const PAPER = tokens.colors.paper;
const PNG_SIZES = tokens.exports.png_sizes_px;

const manifest = [];

// Version string: prefer the pushed tag (GITHUB_REF_NAME on tag triggers),
// then fall back to `git describe` locally, then to 'dev'.
function resolveVersion() {
  const ref = process.env.GITHUB_REF_NAME;
  if (process.env.GITHUB_REF_TYPE === 'tag' && ref) return ref;
  try {
    return execSync('git describe --tags --always --dirty', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}
const VERSION = resolveVersion();

// ────────────────────── helpers ──────────────────────

function ensureDir(p) { mkdirSync(p, { recursive: true }); }
function write(p, data) { ensureDir(dirname(p)); writeFileSync(p, data); track(p); }
function track(p) {
  const buf = readFileSync(p);
  manifest.push({
    path: p.replace(DIST + '/', ''),
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
  });
}

function downloadFont() {
  if (existsSync(FONT_PATH)) return Promise.resolve();
  ensureDir(dirname(FONT_PATH));
  console.log(`↓ Downloading Outfit-Light.ttf`);
  return new Promise((resolvePromise, reject) => {
    const follow = (url) => httpsGet(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return follow(res.headers.location);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { writeFileSync(FONT_PATH, Buffer.concat(chunks)); resolvePromise(); });
    }).on('error', reject);
    follow(FONT_URL);
  });
}

// Rasterise an SVG string to a PNG buffer at width×height.
function rasterise(svg, width, height) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
    background: 'rgba(0,0,0,0)',
  });
  const png = r.render().asPng();
  return height ? sharp(png).resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() : Promise.resolve(png);
}

async function rasteriseSquare(svg, size) {
  return rasterise(svg, size, size);
}

// Composite foreground PNG onto a solid background colour, same size.
async function onBackground(pngBuf, bg, size) {
  return sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  }).composite([{ input: pngBuf }]).png().toBuffer();
}

// Squircle (rounded-rect) background at `size` with radius = size*0.2.
async function squircle(size, bg) {
  const r = Math.round(size * 0.2);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${bg}"/>
     </svg>`
  );
  return sharp(mask).png().toBuffer();
}

// ────────────────────── stages ──────────────────────

// ───── size-tiered badge sources ─────
//
// At small raster sizes, the default 9-unit stroke (9% of the 100-unit
// badge canvas) aliases to ~1.4 px at 16 px output — blurry. We thicken
// the stroke (and the matching cut slot) below 128 px so the q reads
// clean at favicon sizes, matching how fonts ship optical sizes.
//
// Stroke choice verified visually: 14 at 16 px → ~2.2 px → rounds to a
// solid 2 px stroke. 11 at 32 px → ~3.5 px, same at 64 → 7 px.
const STROKE_BUCKETS = [
  { maxSize: 24,   strokeWidth: 14 },
  { maxSize: 96,   strokeWidth: 11 },
  { maxSize: Infinity, strokeWidth: 9 },
];
function strokeFor(size) {
  return STROKE_BUCKETS.find((b) => size <= b.maxSize).strokeWidth;
}

function qBadgeOpaqueSvg(sw) {
  const cutY = (100 - sw) / 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120" width="120" height="120">
  <defs><clipPath id="disc-clip"><circle cx="50" cy="50" r="50"/></clipPath></defs>
  <circle cx="50" cy="50" r="50" fill="#2dd4a8"/>
  <g clip-path="url(#disc-clip)">
    <g stroke="#030712" stroke-width="${sw}" fill="none" stroke-linecap="round">
      <circle cx="50" cy="50" r="30"/>
      <line x1="80" y1="50" x2="80" y2="95"/>
    </g>
    <rect x="10" y="${cutY}" width="80" height="${sw}" fill="#2dd4a8"/>
  </g>
</svg>`;
}
function qBadgeKnockoutSvg(sw) {
  const cutY = (100 - sw) / 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120" width="120" height="120">
  <defs>
    <mask id="q-knockout-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect x="0" y="0" width="100" height="100" fill="white"/>
      <g stroke="black" stroke-width="${sw}" fill="none" stroke-linecap="round">
        <circle cx="50" cy="50" r="30"/>
        <line x1="80" y1="50" x2="80" y2="95"/>
      </g>
      <rect x="10" y="${cutY}" width="80" height="${sw}" fill="white"/>
    </mask>
  </defs>
  <circle cx="50" cy="50" r="50" fill="#2dd4a8" mask="url(#q-knockout-mask)"/>
</svg>`;
}
function qBadgeSvg(variant, sw) {
  return variant === 'light' ? qBadgeOpaqueSvg(sw) : qBadgeKnockoutSvg(sw);
}

async function stageSvg(outlinedByName) {
  const targets = [
    { name: 'q-light.svg', srcPath: join(SRC, 'q-badge-opaque.svg') },
    { name: 'q-dark.svg', srcPath: join(SRC, 'q-badge-knockout.svg') },
    { name: 'lockup-light.svg', content: outlinedByName['lockup-light-outlined.svg'] },
    { name: 'lockup-dark.svg', content: outlinedByName['lockup-dark-outlined.svg'] },
  ];
  for (const t of targets) {
    const raw = t.content ?? readFileSync(t.srcPath, 'utf8');
    // Preserve mask/clipPath: disable plugins that would collapse them.
    const { data } = svgoOptimize(raw, {
      multipass: true,
      plugins: [
        { name: 'preset-default', params: {
          overrides: {
            removeViewBox: false,
            removeHiddenElems: false,
            collapseGroups: false,
            mergePaths: false,
            cleanupIds: false,
            convertPathData: false,
          },
        } },
      ],
    });
    write(join(DIST, 'svg', t.name), data);
  }
}

async function stagePng(outlinedByName) {
  for (const size of PNG_SIZES) {
    const sw = strokeFor(size);
    for (const variant of ['light', 'dark']) {
      const svg = qBadgeSvg(variant, sw);
      const transparent = await rasteriseSquare(svg, size);
      write(join(DIST, 'png', `q-${variant}-${size}.png`), transparent);
      write(join(DIST, 'png', `q-${variant}-${size}-on-light.png`),
        await onBackground(transparent, PAPER, size));
      write(join(DIST, 'png', `q-${variant}-${size}-on-dark.png`),
        await onBackground(transparent, SURFACE_DARK, size));
    }

    // Lockups: need legible wordmark — skip sizes below 180.
    if (size < 180) continue;
    const llBuf = await rasterise(outlinedByName['lockup-light-outlined.svg'], size);
    const ldBuf = await rasterise(outlinedByName['lockup-dark-outlined.svg'], size);
    const lh = Math.round((size * 100) / 346);
    const padToSquare = async (buf, bg) => sharp({
      create: { width: size, height: size, channels: 4, background: bg },
    }).composite([{ input: buf, top: Math.round((size - lh) / 2), left: 0 }]).png().toBuffer();
    const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
    write(join(DIST, 'png', `lockup-light-${size}.png`), await padToSquare(llBuf, PAPER));
    // Knockout: keep the q cut-out transparent so whatever surface the asset
    // lands on shows through. The mint disc + mint "uebi" are opaque paint.
    write(join(DIST, 'png', `lockup-dark-${size}.png`), await padToSquare(ldBuf, transparent));
  }
}

async function stageFavicon() {
  // Each favicon size picks its own stroke bucket — small ones are thicker.
  const raster = (variant, size) => rasteriseSquare(qBadgeSvg(variant, strokeFor(size)), size);

  const fav16 = await raster('dark', 16);
  const fav32 = await raster('dark', 32);
  const fav48 = await raster('dark', 48);
  write(join(DIST, 'favicon', 'favicon-16.png'), fav16);
  write(join(DIST, 'favicon', 'favicon-32.png'), fav32);

  const ico = await pngToIco([fav16, fav32, fav48]);
  write(join(DIST, 'favicon', 'favicon.ico'), ico);

  // apple-touch-icon: light variant on white squircle, 180x180, r=36.
  const appleInner = await raster('light', Math.round(180 * 0.75));
  const appleBg = await squircle(180, '#ffffff');
  const apple = await sharp(appleBg).composite([{
    input: appleInner,
    top: Math.round((180 - 180 * 0.75) / 2),
    left: Math.round((180 - 180 * 0.75) / 2),
  }]).png().toBuffer();
  write(join(DIST, 'favicon', 'apple-touch-icon.png'), apple);

  // android-chrome: dark variant on dark squircle.
  for (const size of [192, 512]) {
    const inner = await raster('dark', Math.round(size * 0.75));
    const bg = await squircle(size, SURFACE_DARK);
    const composed = await sharp(bg).composite([{
      input: inner,
      top: Math.round((size - size * 0.75) / 2),
      left: Math.round((size - size * 0.75) / 2),
    }]).png().toBuffer();
    write(join(DIST, 'favicon', `android-chrome-${size}.png`), composed);
  }

  const webmanifest = {
    name: 'quebi',
    short_name: 'quebi',
    icons: [
      { src: '/android-chrome-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512.png', sizes: '512x512', type: 'image/png' },
    ],
    theme_color: SURFACE_DARK,
    background_color: SURFACE_DARK,
    display: 'standalone',
  };
  write(join(DIST, 'favicon', 'site.webmanifest'), JSON.stringify(webmanifest, null, 2));
}

function renderShowcase() {
  const byBucket = (prefix) => manifest
    .filter((f) => f.path.startsWith(prefix))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  const fmtBytes = (n) => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;

  const assetCard = (f, bgClass) => `
      <figure class="asset ${bgClass}">
        <div class="thumb"><img src="${f.path}" alt="${f.path}" loading="lazy"></div>
        <figcaption>
          <a href="${f.path}" download><code>${f.path.split('/').pop()}</code></a>
          <span class="bytes">${fmtBytes(f.bytes)}</span>
        </figcaption>
      </figure>`;

  const svgCards = byBucket('svg/').map((f) => {
    const cls = f.path.includes('dark') ? 'on-dark' : 'on-paper';
    return assetCard(f, cls);
  }).join('\n');

  const pngBgFor = (p) => p.includes('-on-light') ? 'on-paper' : p.includes('-on-dark') ? 'on-dark'
    : /\/q-dark-/.test(p) || /\/lockup-dark-/.test(p) ? 'on-dark' : 'on-paper';
  const qGroup = (variant, suffix) => byBucket(`png/q-${variant}-`)
    .filter((f) => suffix === 'transparent'
      ? !f.path.includes('-on-light') && !f.path.includes('-on-dark')
      : f.path.includes(`-${suffix}`))
    .map((f) => assetCard(f, pngBgFor(f.path))).join('\n');
  const qLightTransparent = qGroup('light', 'transparent');
  const qLightOnLight = qGroup('light', 'on-light');
  const qLightOnDark = qGroup('light', 'on-dark');
  const qDarkTransparent = qGroup('dark', 'transparent');
  const qDarkOnLight = qGroup('dark', 'on-light');
  const qDarkOnDark = qGroup('dark', 'on-dark');
  const lockupLight = byBucket('png/lockup-light').map((f) => assetCard(f, 'on-paper')).join('\n');
  const lockupDark = byBucket('png/lockup-dark').map((f) => assetCard(f, 'on-dark')).join('\n');
  const favicons = byBucket('favicon/').map((f) => {
    const isImg = /\.(png|ico|svg)$/.test(f.path);
    if (!isImg) return `
      <figure class="asset on-paper">
        <div class="thumb"><code style="font-size:11px;opacity:.6">${f.path.split('/').pop()}</code></div>
        <figcaption>
          <a href="${f.path}" download><code>${f.path.split('/').pop()}</code></a>
          <span class="bytes">${fmtBytes(f.bytes)}</span>
        </figcaption>
      </figure>`;
    const cls = f.path.includes('android') ? 'on-dark' : 'on-paper';
    return assetCard(f, cls);
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>quebi · brand assets</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --surface:#030712; --mint:#2dd4a8; --paper:#ffffff; --cream:#f1ede4;
    --ink:#111; --muted:#666; --line:#e7e7e3;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:"Outfit",ui-sans-serif,system-ui,sans-serif;color:var(--ink);background:#fafaf8;line-height:1.55}
  header{padding:56px 56px 32px;background:#fff;border-bottom:1px solid var(--line)}
  header h1{margin:0 0 8px;font-size:32px;font-weight:600;letter-spacing:-0.02em}
  header p{margin:6px 0;color:#444;max-width:760px;font-size:15px}
  header .version{display:inline-block;margin-left:10px;padding:2px 10px;border-radius:999px;background:#030712;color:#2dd4a8;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:500;letter-spacing:0;vertical-align:middle}
  main{padding:16px 56px 96px;max-width:1400px;margin:0 auto}
  section{margin:56px 0}
  h2{margin:0 0 14px;font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:600}
  h3{margin:32px 0 10px;font-size:15px;font-weight:600}
  p{margin:8px 0;font-size:14.5px;color:#333;max-width:780px}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;background:#f3f2ee;padding:1px 5px;border-radius:4px}
  a{color:#0d4a3a;text-decoration:none;border-bottom:1px dotted #0d4a3a}
  a:hover{color:#020d05}

  .hero{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px}
  .hero > div{border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .hero .stage{padding:72px 40px;display:flex;align-items:center;justify-content:center;min-height:260px}
  .hero .light{background:var(--paper)}
  .hero .dark{background:var(--surface)}
  .hero img{max-width:80%;max-height:180px}
  .hero .meta{padding:16px 20px;border-top:1px solid var(--line);font-size:13.5px;background:#fbfbfa}
  .hero .meta b{display:block;margin-bottom:4px}
  .hero .dark + .meta{background:#0b0f1a;color:#d4d4d0;border-top-color:#1a1f2e}

  table.rules{border-collapse:collapse;width:100%;max-width:820px;margin:16px 0;font-size:14px}
  table.rules th,table.rules td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
  table.rules th{font-weight:600;color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.08em}
  .chip{display:inline-flex;align-items:center;gap:6px;font-family:ui-monospace,monospace;font-size:12px}
  .chip i{width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,.1);display:inline-block}

  .dos{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}
  .dos > div{padding:16px 18px;border-radius:10px;font-size:14px}
  .dos .do{background:#ecfaf3;border-left:3px solid #0d4a3a}
  .dos .dont{background:#fdecec;border-left:3px solid #b02a2a}
  .dos ul{margin:6px 0 0 18px;padding:0}
  .dos li{margin:4px 0}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-top:14px}
  .asset{margin:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;display:flex;flex-direction:column}
  .asset .thumb{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;padding:16px}
  .asset.on-paper .thumb{background:var(--paper)}
  .asset.on-dark .thumb{background:var(--surface);background-image:linear-gradient(45deg,#1a1f2e 25%,transparent 25%),linear-gradient(-45deg,#1a1f2e 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1a1f2e 75%),linear-gradient(-45deg,transparent 75%,#1a1f2e 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
  .asset .thumb img{max-width:100%;max-height:100%;object-fit:contain}
  .asset figcaption{padding:9px 11px;border-top:1px solid #eee;font-size:11.5px;display:flex;justify-content:space-between;gap:8px;background:#fbfbfa}
  .asset figcaption a{border:none;color:inherit}
  .asset figcaption code{background:transparent;padding:0;font-size:11.5px}
  .asset .bytes{color:var(--muted);white-space:nowrap}

  .grid.wide{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
</style>
</head>
<body>
<header>
  <h1>quebi · brand assets <span class="version">${VERSION}</span></h1>
  <p>Source SVGs, raster exports, and favicon bundle — generated from <code>src/</code> by <code>pnpm run build</code>. Two pinned variants, two colours: <code>#030712</code> and <code>#2dd4a8</code>.</p>
</header>
<main>

<section>
  <h2>The lockup · two variants</h2>
  <div class="hero">
    <div>
      <div class="stage light"><img src="svg/lockup-light-outlined.svg" alt="lockup light"></div>
      <div class="meta"><b>Light · opaque</b>Mint disc with a black “q” painted on top; “uebi” in black. Use on white paper and light surfaces. Safe for single-ink print (black plate + mint spot).</div>
    </div>
    <div>
      <div class="stage dark"><img src="svg/lockup-dark-outlined.svg" alt="lockup dark"></div>
      <div class="meta"><b>Dark · knockout</b>Mint disc with the “q” cut through to the surface; “uebi” in mint. Use on dark surfaces — the knockout lets photographic or patterned backgrounds show through the q.</div>
    </div>
  </div>
</section>

<section>
  <h2>Colour system</h2>
  <table class="rules">
    <thead><tr><th>Token</th><th>Hex</th><th>Role</th></tr></thead>
    <tbody>
      <tr><td><code>surface</code></td><td><span class="chip"><i style="background:#030712"></i>#030712</span></td><td>Dark surface + ink on light variant</td></tr>
      <tr><td><code>mint</code></td><td><span class="chip"><i style="background:#2dd4a8"></i>#2dd4a8</span></td><td>Disc + wordmark on dark variant</td></tr>
      <tr><td><code>paper</code></td><td><span class="chip"><i style="background:#ffffff"></i>#ffffff</span></td><td>Light surface background</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h2>Master grid</h2>
  <p>Badge lives in a 100×100 SVG box; lockup is 346×100. All dimensions are in SVG user units.</p>
  <table class="rules">
    <tbody>
      <tr><td><b>disc</b></td><td>circle r=50 centred at (50,50)</td></tr>
      <tr><td><b>bowl</b></td><td>circle r=30 centred at (50,50), stroke weight 9</td></tr>
      <tr><td><b>descender</b></td><td>(80,50) → (80,95), stroke 9, round cap</td></tr>
      <tr><td><b>cut slot</b></td><td>x=10, y=45.5, w=80, h=9 (matches stroke)</td></tr>
      <tr><td><b>wordmark</b></td><td>Outfit Light (300), font-size 115, dominant-baseline middle anchored to y=50</td></tr>
      <tr><td><b>letter x-origins</b></td><td>0 / 66 / 132 / 198 (wordmark) · 106 / 172 / 238 / 304 (lockup)</td></tr>
    </tbody>
  </table>
  <p>The q’s cut slot and the e’s crossbar are mathematically colinear at y=50 — that’s the hinge that binds the whole mark together. The “e” carries no cut band because its own crossbar already reads as the cut.</p>
</section>

<section>
  <h2>Usage guidelines</h2>
  <div class="dos">
    <div class="do"><b>Do</b>
      <ul>
        <li>Use the <b>light</b> variant on white/cream surfaces and single-ink prints.</li>
        <li>Use the <b>dark</b> variant on dark, busy, or photographic surfaces — the knockout reveals the surface through the q.</li>
        <li>For app icons, use the squircle-wrapped variants from <code>favicon/</code>.</li>
        <li>For embedding or third-party handoff, prefer <code>lockup-*.outlined.svg</code> — no font dependency.</li>
      </ul>
    </div>
    <div class="dont"><b>Don’t</b>
      <ul>
        <li>Recolour, tint, gradient, or outline the marks. Two colours, full stop.</li>
        <li>Place light on dark or dark on light — the wordmark will vanish.</li>
        <li>Shrink the lockup below 180 px — wordmark loses legibility. Use the badge alone instead.</li>
        <li>Substitute a different sans-serif for Outfit — the e/q geometry stops aligning.</li>
      </ul>
    </div>
  </div>
</section>

<section>
  <h2>Typography</h2>
  <p>Wordmark is set in <b>Outfit Light (300)</b>, by <a href="https://fonts.google.com/specimen/Outfit" target="_blank">Rodrigo Fuenzalida & Outfitio</a>, SIL OFL 1.1. The build script downloads the TTF automatically and outlines the text into <code>&lt;path&gt;</code> data, so shipped assets have no font dependency. Human-editable source SVGs keep live <code>&lt;text&gt;</code> and reference the font via <code>@font-face</code>.</p>
</section>

<section>
  <h2>SVG sources</h2>
  <p><code>*-outlined.svg</code> = text converted to paths (safe anywhere, no font needed). <code>*.svg</code> without the suffix = live text (editable, but the font must be present to render correctly).</p>
  <div class="grid wide">${svgCards}</div>
</section>

<section>
  <h2>Optical sizing</h2>
  <p>Below 128 px the q’s stroke is thickened so it doesn’t blur at favicon sizes. The design stays the same mark — only the stroke weight and matching cut slot change by bucket.</p>
  <table class="rules">
    <thead><tr><th>Size bucket</th><th>stroke-width</th><th>cut height</th></tr></thead>
    <tbody>
      <tr><td>≤ 24 px</td><td>14</td><td>14</td></tr>
      <tr><td>32 – 96 px</td><td>11</td><td>11</td></tr>
      <tr><td>≥ 128 px</td><td>9 (default)</td><td>9</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h2>PNG · q light · transparent</h2>
  <p>Default — mint disc + black q on transparent.</p>
  <div class="grid">${qLightTransparent}</div>
</section>

<section>
  <h2>PNG · q light · on light background</h2>
  <p>Pre-composited on paper (<code>#ffffff</code>).</p>
  <div class="grid">${qLightOnLight}</div>
</section>

<section>
  <h2>PNG · q light · on dark background</h2>
  <p>Pre-composited on surface (<code>#030712</code>). Note: the black q disappears into the dark surface — for dark backgrounds, prefer the dark (knockout) variant.</p>
  <div class="grid">${qLightOnDark}</div>
</section>

<section>
  <h2>PNG · q dark (knockout) · transparent</h2>
  <p>Default — mint disc with the q cut through to whatever surface the asset is placed on.</p>
  <div class="grid">${qDarkTransparent}</div>
</section>

<section>
  <h2>PNG · q dark · on light background</h2>
  <p>Pre-composited on paper — the knockout reveals white.</p>
  <div class="grid">${qDarkOnLight}</div>
</section>

<section>
  <h2>PNG · q dark · on dark background</h2>
  <p>Pre-composited on surface (<code>#030712</code>) — the knockout reveals the surface.</p>
  <div class="grid">${qDarkOnDark}</div>
</section>

<section>
  <h2>PNG · lockup · light</h2>
  <div class="grid wide">${lockupLight}</div>
</section>

<section>
  <h2>PNG · lockup · dark (transparent)</h2>
  <div class="grid wide">${lockupDark}</div>
</section>

<section>
  <h2>Favicon & app icons</h2>
  <p>Drop-in bundle for web and mobile: multi-resolution ICO (16/32/48), dedicated PNGs, 180×180 apple-touch-icon (light q on white squircle), 192/512 android-chrome (dark q on dark squircle), and a minimal <code>site.webmanifest</code>.</p>
  <div class="grid">${favicons}</div>
</section>

<footer style="margin-top:80px;padding-top:24px;border-top:1px solid var(--line);color:var(--muted);font-size:13px">
  <p>quebi-branding <code>${VERSION}</code> · generated ${new Date().toISOString().slice(0, 10)} · see <code>manifest.json</code> for sha256s and byte sizes.</p>
</footer>

</main>
</body>
</html>
`;
}

function stageHtml() {
  // Written directly — not tracked in manifest (it's meta about the other files).
  const html = renderShowcase();
  ensureDir(DIST);
  writeFileSync(join(DIST, 'readme.html'), html);
}

async function validate() {
  // Sanity: centre pixel of q-light-256 is near-black (the q glyph).
  const buf = readFileSync(join(DIST, 'png', 'q-light-256.png'));
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  // Top of the bowl: SVG (50, 20) inside a 120-unit viewBox at (-10,-10).
  // That maps to (50 - -10)/120 = 50% x, (20 - -10)/120 = 25% y of output.
  const idx = (Math.round(info.height * 0.25) * info.width + Math.floor(info.width / 2)) * info.channels;
  const [r, g, b] = [data[idx], data[idx + 1], data[idx + 2]];
  const dark = r < 40 && g < 40 && b < 40;
  if (!dark) throw new Error(`Validation: q-light-256 centre pixel is ${r},${g},${b} — expected near-black`);
  console.log(`✓ centre pixel sanity: q-light-256 = #${[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}`);
}

// ────────────────────── main ──────────────────────

async function main() {
  const clean = process.argv.includes('--clean');
  if (clean && existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
  ensureDir(DIST);

  await downloadFont();

  const font = loadFont(FONT_PATH);
  const outlined = {
    'lockup-light-outlined.svg': outlineLockup(font, 'light'),
    'lockup-dark-outlined.svg': outlineLockup(font, 'dark'),
  };
  // Persist outlined intermediates for debugging / third-party use.
  for (const [name, content] of Object.entries(outlined)) {
    write(join(DIST, 'svg', name), content);
  }

  await stageSvg(outlined);
  await stagePng(outlined);
  await stageFavicon();
  await validate();

  manifest.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(join(DIST, 'manifest.json'), JSON.stringify({
    brand: tokens.brand,
    version: VERSION,
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    files: manifest,
  }, null, 2));

  stageHtml();

  // Summary
  console.log(`\n${'Path'.padEnd(48)} ${'Bytes'.padStart(10)}`);
  console.log('─'.repeat(60));
  for (const f of manifest) console.log(`${f.path.padEnd(48)} ${String(f.bytes).padStart(10)}`);
  console.log(`\n✓ ${manifest.length} files → ${DIST.replace(ROOT + '/', '')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
