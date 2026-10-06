#!/usr/bin/env node
// Embed every built PNG logo into the quebi design-system page as a
// "catalogue" section (base64, so the page stays a single self-contained
// file). The page is not part of this repo: pass its path, or keep a copy at
// ./quebi-design-system.html (git-ignored).
// Re-runnable: the section, its styles and its nav link sit between
// <!-- catalogue:… --> markers and are replaced on each run.
//
// Usage:  node scripts/catalogue.mjs [path/to/quebi-design-system.html]   (after `pnpm run build`)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');
const PAGE = resolve(process.argv[2] ?? join(ROOT, 'quebi-design-system.html'));

if (!existsSync(join(DIST, 'manifest.json'))) {
  console.error('dist/manifest.json missing — run `pnpm run build` first');
  process.exit(1);
}
if (!existsSync(PAGE)) {
  console.error(`design system page not found: ${PAGE}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
const pngs = manifest.files.filter((f) => f.path.endsWith('.png'));
const byPath = new Map(pngs.map((f) => [f.path, f]));

const SIZE_RE = /-(\d+)(?:-on-(?:light|dark))?\.png$/;
const sizeOf = (p) => Number(p.match(SIZE_RE)?.[1] ?? 0);
const bySize = (a, b) => sizeOf(a) - sizeOf(b);
const fmtBytes = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

// Groups in display order. `dark` = show on the ink ground.
const pick = (re) => pngs.map((f) => f.path).filter((p) => re.test(p)).sort(bySize);
const groups = [
  { title: 'lockup · light', note: 'Ink lockup, pre-composited on white.', dark: false, files: pick(/^png\/lockup-light-/) },
  { title: 'lockup · dark', note: 'Gray-50 lockup, transparent; the q cut-out shows the ground.', dark: true, files: pick(/^png\/lockup-dark-/) },
  { title: 'mark · light · transparent', note: 'Ink disc, white q. For light grounds.', dark: false, files: pick(/^png\/q-light-\d+\.png$/) },
  { title: 'mark · light · on white', note: '', dark: false, files: pick(/^png\/q-light-\d+-on-light\.png$/) },
  { title: 'mark · light · on ink', note: 'The ink disc merges into an ink ground; prefer the dark mark there.', dark: true, files: pick(/^png\/q-light-\d+-on-dark\.png$/) },
  { title: 'mark · dark · transparent', note: 'Gray-50 disc, ink q. For dark grounds.', dark: true, files: pick(/^png\/q-dark-\d+\.png$/) },
  { title: 'mark · dark · on ink', note: '', dark: true, files: pick(/^png\/q-dark-\d+-on-dark\.png$/) },
  { title: 'mark · dark · on white', note: 'The gray-50 disc barely separates from white; prefer the light mark there.', dark: false, files: pick(/^png\/q-dark-\d+-on-light\.png$/) },
  {
    title: 'favicon & app icons',
    note: 'favicon (ink mark), apple-touch-icon (ink mark on white squircle), android-chrome (gray-50 mark on ink squircle).',
    dark: false,
    files: ['favicon/favicon-16.png', 'favicon/favicon-32.png', 'favicon/apple-touch-icon.png',
      'favicon/android-chrome-192.png', 'favicon/android-chrome-512.png'].filter((p) => byPath.has(p)),
  },
];

const listed = new Set(groups.flatMap((g) => g.files));
const missing = pngs.filter((f) => !listed.has(f.path));
if (missing.length) {
  console.error(`catalogue: PNGs not assigned to a group: ${missing.map((f) => f.path).join(', ')}`);
  process.exit(1);
}

async function figure(path, dark) {
  const buf = readFileSync(join(DIST, path));
  const { width, height } = await sharp(buf).metadata();
  const name = path.split('/').pop();
  // Show small files at their real pixel size; cap the big ones.
  return `<figure class="lg cat-f${dark ? ' lgd' : ''}"><img src="data:image/png;base64,${buf.toString('base64')}" alt="${name}" width="${width}" height="${height}"><figcaption><code>${name}</code><span>${width}×${height} · ${fmtBytes(byPath.get(path).bytes)}</span></figcaption></figure>`;
}

const parts = [];
for (const g of groups) {
  if (!g.files.length) continue;
  const figs = await Promise.all(g.files.map((p) => figure(p, g.dark)));
  parts.push(`  <h3 class="sub">${g.title}</h3>${g.note ? `<p class="mut cat-n">${g.note}</p>` : ''}\n  <div class="lgs cat">${figs.join('')}</div>`);
}

const section = `<!-- catalogue:start -->
<style>
.cat{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.cat .cat-f{padding:20px;justify-content:space-between}
.cat .cat-f img{height:auto;width:auto;max-width:100%;max-height:128px}
.cat .cat-f figcaption{display:flex;flex-direction:column;align-items:center;gap:2px;font:400 11px/1.3 var(--font-mono);color:#4b5563}
.cat .cat-f.lgd figcaption{color:#9ca3af}
.cat-n{margin:0 0 12px;font-size:14px}
</style>
<section class="s" id="catalogue"><h2>logo catalogue</h2><p class="qb-label">${pngs.length} png files · build ${manifest.version}</p>
  <div class="readme"><p>Every raster the branding build exports, embedded here so the catalogue travels with this page. Files below 128 px are shown at their real pixel size. Download the release zip for the files themselves; SVG and ICO versions are in it too.</p></div>
${parts.join('\n')}
</section>
<!-- catalogue:end -->`;

let html = readFileSync(PAGE, 'utf8');
const block = /<!-- catalogue:start -->[\s\S]*?<!-- catalogue:end -->/;
if (block.test(html)) {
  html = html.replace(block, () => section);
} else {
  // First run: insert straight after the logos section.
  const start = html.indexOf('<section class="s" id="logos">');
  if (start < 0) throw new Error('logos section not found in design system page');
  const end = html.indexOf('</section>', start) + '</section>'.length;
  html = `${html.slice(0, end)}\n\n${section}${html.slice(end)}`;
}

// The page's own four logo files (logos section, plus the Logo/NavBar/Stage
// previews that embed the same images) are swapped for renders of the
// build's vector sources: transparent and cropped tight, unlike the padded
// release PNGs. Each is found by its alt name in the logos section, then
// every copy of that payload in the page is replaced.
const { Resvg } = await import('@resvg/resvg-js');
const svgSrc = (name) => readFileSync(join(DIST, 'svg', name), 'utf8');
const tightMark = (name) => svgSrc(name)
  .replace(/viewBox="[^"]+"/, 'viewBox="0 0 100 100"')
  .replace(/width="[^"]+" height="[^"]+"/, 'width="100" height="100"');
const render = (svg, fit) => new Resvg(svg, { fitTo: fit, background: 'rgba(0,0,0,0)' }).render().asPng();
const pageLogos = {
  'quebi-wordmark-ink.png': render(svgSrc('lockup-light-outlined.svg'), { mode: 'height', value: 240 }),
  'quebi-wordmark-light.png': render(svgSrc('lockup-dark-outlined.svg'), { mode: 'height', value: 240 }),
  'quebi-mark-ink.png': render(tightMark('q-light.svg'), { mode: 'width', value: 320 }),
  'quebi-mark-light.png': render(tightMark('q-dark.svg'), { mode: 'width', value: 320 }),
};
const dims = {};
for (const [alt, png] of Object.entries(pageLogos)) {
  const m = html.match(new RegExp(`<img src="data:image/png;base64,([^"]+)" alt="${alt.replace('.', '\\.')}"`));
  if (!m) throw new Error(`logo ${alt} not found in logos section`);
  const { width, height } = await sharp(png).metadata();
  dims[alt] = `${width} × ${height}`;
  html = html.split(m[1]).join(png.toString('base64'));
}
const provenance = `These are rasters (${dims['quebi-wordmark-ink.png']} and ${dims['quebi-mark-ink.png']} px) rendered by the branding build from its vector sources (<code>lockup-*-outlined.svg</code>, <code>q-*.svg</code>); the SVGs and every size are in the release zip and the logo catalogue below.</p>`;
if (!/These are rasters \(.*?<\/p>/.test(html)) throw new Error('logos provenance sentence not found');
html = html.replace(/These are rasters \(.*?<\/p>/, () => provenance);

const navLink = '<!-- catalogue:nav --><a href="#catalogue">logo catalogue</a>';
if (!html.includes('<!-- catalogue:nav -->')) {
  const logosLink = '<a href="#logos">logos</a>';
  if (!html.includes(logosLink)) throw new Error('logos nav link not found');
  html = html.replace(logosLink, `${logosLink}${navLink}`);
}

writeFileSync(PAGE, html);
console.log(`✓ catalogue: ${pngs.length} PNGs in ${groups.filter((g) => g.files.length).length} groups → ${PAGE.replace(ROOT + '/', '')}`);
