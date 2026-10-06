// Replace <text> in the three text-bearing SVGs with <path> data using the
// Outfit-Light TTF. Produces *-outlined.svg in the output dir so every
// downstream rasteriser is font-independent.
import { readFileSync, writeFileSync } from 'node:fs';
import opentype from 'opentype.js';

// The q's stroke weight in the lockup (badge box is 100×100).
const STROKE = 9;
// Outfit Light's u/b/i stems are 70–71 font units wide (upem 1000). The font
// size is chosen so these stems come out exactly STROKE thick.
const STEM_UNITS = 70.5;
// Outfit Light's e crossbar spans y=209..269 font units. The q's cut slot is
// set to exactly this band so the two read as one line.
const E_BAR = [209, 269];
// Letter pitch (origin to origin) in em, and the gap from the disc edge to the
// u's left ink edge in badge units. Carried over from the original lockup.
const PITCH_EM = 0.574;
const GAP = 12.8;

export function loadFont(fontPath) {
  const buf = readFileSync(fontPath);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// Everything the lockup's q has to agree with is derived from the font here:
// - the u's stems set the font size (stem = q stroke),
// - the u's ink box (flat top at x-height, round bottom with overshoot) sets
//   the q ring: its outer edge touches exactly the u's top and bottom,
// - the u's ink centre sits on the ring centre (y=50),
// - the e's crossbar sets the cut slot.
export function lockupGeometry(font) {
  const upem = font.unitsPerEm;
  const fontSize = (STROKE * upem) / STEM_UNITS;
  const s = fontSize / upem;
  const u = font.charToGlyph('u').getBoundingBox();
  const outerR = ((u.y2 - u.y1) * s) / 2;
  const baseline = 50 + ((u.y1 + u.y2) / 2) * s;
  const cut = { y: baseline - E_BAR[1] * s, height: (E_BAR[1] - E_BAR[0]) * s };

  const uX = 100 + GAP - u.x1 * s;
  const letters = [...'uebi'].map((char, i) => ({ char, x: uX + i * PITCH_EM * fontSize }));

  const glyphs = letters.map(({ char }) => font.charToGlyph(char).getBoundingBox());
  const top = Math.min(0, baseline - Math.max(...glyphs.map((b) => b.y2)) * s);
  const right = letters.at(-1).x + glyphs.at(-1).x2 * s;

  return {
    fontSize, baseline, letters, cut,
    stroke: STROKE,
    r: outerR - STROKE / 2,
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
  const defs = `  <defs>
    <mask id="q-knockout-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect x="0" y="0" width="100" height="100" fill="white"/>
      <g stroke="black" stroke-width="${g.stroke}" fill="none" stroke-linecap="round">
        <circle cx="50" cy="50" r="${r2(g.r)}"/>
        <line x1="${r2(50 + g.r)}" y1="50" x2="${r2(50 + g.r)}" y2="100"/>
      </g>
      <rect x="10" y="${r2(g.cut.y)}" width="80" height="${r2(g.cut.height)}" fill="white"/>
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
