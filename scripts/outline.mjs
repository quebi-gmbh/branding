// Replace <text> in the three text-bearing SVGs with <path> data using the
// Outfit variable TTF. Produces *-outlined.svg in the output dir so every
// downstream rasteriser is font-independent.
import { readFileSync, writeFileSync } from 'node:fs';
import opentype from 'opentype.js';

// The lockup's q is fixed: the same geometry as the standalone mark (disc
// r=50, bowl r=30, stroke 9, cut slot 45.5..54.5, descender at x=80). The
// type is fitted to it.
const Q = { r: 30, stroke: 9, cutY: 45.5, cutHeight: 9, descenderX: 80 };
const Q_HEIGHT = 2 * Q.r + Q.stroke; // outer edge of the bowl: 15.5..84.5
// Letter pitch (origin to origin) and the gap from the disc edge to the u's
// left ink edge, both in em. Carried over from the original lockup.
const PITCH_EM = 0.574;
const GAP_EM = 0.111;

export function loadFont(fontPath) {
  const buf = readFileSync(fontPath);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// The u at 1 unit per font unit, y up: ink box and stem width. The stems'
// flat tops are the horizontal segments at the x-height.
function measureU(font) {
  const p = font.getPath('u', 0, 0, font.unitsPerEm);
  const b = p.getBoundingBox();
  const top = -b.y1;
  const xs = p.commands.filter((c) => c.x !== undefined && Math.abs(-c.y - top) < 0.5)
    .map((c) => c.x).sort((a, c) => a - c);
  return { top, bottom: -b.y2, left: b.x1, stem: xs[1] - xs[0] };
}

// Outfit is a variable font (wght 100..900). Pick the weight at which the u,
// scaled to the q's height, has stems exactly the q's stroke: the u's stem
// to height ratio grows monotonically with weight, so bisect.
function fitWeight(font) {
  const target = Q.stroke / Q_HEIGHT;
  const ratio = (w) => {
    font.variation.set({ wght: w });
    const u = measureU(font);
    return u.stem / (u.top - u.bottom);
  };
  let lo = 100, hi = 900;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (ratio(mid) < target) lo = mid; else hi = mid;
  }
  const wght = Math.round(((lo + hi) / 2) * 100) / 100;
  font.variation.set({ wght });
  return wght;
}

// Everything is derived from the font here:
// - the weight, so the u's stems equal the q's stroke at the q's height,
// - the font size, so the u's ink (flat top at x-height, round bottom with
//   overshoot) spans exactly the bowl's outer edge, 15.5..84.5,
// - the baseline, so the u's ink centre sits on the bowl centre (y=50).
// Leaves the font set to the fitted weight for the getPath() calls after it.
export function lockupGeometry(font) {
  const upem = font.unitsPerEm;
  const wght = fitWeight(font);
  const u = measureU(font);
  const s = Q_HEIGHT / (u.top - u.bottom);
  const fontSize = s * upem;
  const baseline = 50 + ((u.top + u.bottom) / 2) * s;

  const uX = 100 + GAP_EM * fontSize - u.left * s;
  const letters = [...'uebi'].map((char, i) => ({ char, x: uX + i * PITCH_EM * fontSize }));

  const boxes = letters.map(({ char, x }) => font.getPath(char, x, baseline, fontSize).getBoundingBox());
  const top = Math.min(0, ...boxes.map((b) => b.y1));
  const right = Math.max(...boxes.map((b) => b.x2));

  return {
    wght, fontSize, baseline, letters,
    q: Q,
    viewBox: { x: 0, y: top, width: right, height: 100 - top },
  };
}

const r2 = (n) => Math.round(n * 100) / 100;

// Serialise path commands ourselves: opentype.js's toPathData() prints "NaN"
// for float-noise values such as 74.00000000000001.
function pathData(path) {
  const n = (v) => String(Math.round(v * 1000) / 1000);
  return path.commands.map((c) => {
    switch (c.type) {
      case 'M': case 'L': return `${c.type}${n(c.x)} ${n(c.y)}`;
      case 'Q': return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
      case 'C': return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
      default: return 'Z';
    }
  }).join('');
}

function letterPaths(font, letters, baselineY, fontSize, fill) {
  return letters
    .map(({ char, x }) => {
      const d = pathData(font.getPath(char, x, baselineY, fontSize));
      return `  <path d="${d}" fill="${fill}"/>`;
    })
    .join('\n');
}

// Rebuild each SVG with text replaced by outlined paths. We strip the
// <style>/<defs> that carried the @font-face — no longer needed.
export function outlineWordmark(font, fill) {
  const g = lockupGeometry(font);
  const x0 = g.letters[0].x;
  const letters = g.letters.map((l) => ({ ...l, x: l.x - x0 }));
  const w = r2(g.viewBox.width - x0);
  const vb = `0 ${r2(g.viewBox.y)} ${w} ${r2(g.viewBox.height)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${r2(g.viewBox.height)}">
${letterPaths(font, letters, g.baseline, g.fontSize, fill)}
</svg>
`;
}

// Both lockup variants share one construction: a single-ink knockout disc
// (q cut through to the ground) next to "uebi" in the same ink.
export function outlineLockup(font, ink) {
  const g = lockupGeometry(font);
  const { x, y, width, height } = g.viewBox;
  const { q } = g;
  const defs = `  <defs>
    <mask id="q-knockout-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect x="0" y="0" width="100" height="100" fill="white"/>
      <g stroke="black" stroke-width="${q.stroke}" fill="none" stroke-linecap="round">
        <circle cx="50" cy="50" r="${q.r}"/>
        <line x1="${q.descenderX}" y1="50" x2="${q.descenderX}" y2="95"/>
      </g>
      <rect x="10" y="${q.cutY}" width="80" height="${q.cutHeight}" fill="white"/>
    </mask>
  </defs>`;
  const badge = `  <g>
    <circle cx="50" cy="50" r="50" fill="${ink}" mask="url(#q-knockout-mask)"/>
  </g>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x)} ${r2(y)} ${r2(width)} ${r2(height)}" width="${r2(width)}" height="${r2(height)}">
${defs}
${badge}
${letterPaths(font, g.letters, g.baseline, g.fontSize, ink)}
</svg>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const font = loadFont(process.argv[2]);
  writeFileSync(process.argv[3], outlineWordmark(font, '#030712'));
}
