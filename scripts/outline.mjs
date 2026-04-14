// Replace <text> in the three text-bearing SVGs with <path> data using the
// Outfit-Light TTF. Produces *-outlined.svg in the output dir so every
// downstream rasteriser is font-independent.
import { readFileSync, writeFileSync } from 'node:fs';
import opentype from 'opentype.js';

const FONT_SIZE = 115;

export function loadFont(fontPath) {
  const buf = readFileSync(fontPath);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// dominant-baseline="middle" (as rendered by browsers) aligns the mid-x-height
// line to the anchor y. So baseline sits sxHeight/2 below that anchor.
function baselineFor(font, anchorY) {
  const upem = font.unitsPerEm;
  const xHeight = font.tables.os2?.sxHeight || 520;
  return anchorY + (xHeight * FONT_SIZE) / upem / 2;
}

function letterPaths(font, letters, baselineY, fill) {
  return letters
    .map(({ char, x }) => {
      const d = font.getPath(char, x, baselineY, FONT_SIZE).toPathData(3);
      return `  <path d="${d}" fill="${fill}"/>`;
    })
    .join('\n');
}

// Rebuild each SVG with text replaced by outlined paths. We strip the
// <style>/<defs> that carried the @font-face — no longer needed.
export function outlineWordmark(font, fill) {
  const baselineY = baselineFor(font, 50);
  const letters = [
    { char: 'u', x: 0 },
    { char: 'e', x: 66 },
    { char: 'b', x: 132 },
    { char: 'i', x: 198 },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100" width="240" height="100" overflow="visible">
${letterPaths(font, letters, baselineY, fill)}
</svg>
`;
}

export function outlineLockup(font, variant) {
  const baselineY = baselineFor(font, 50);
  const letters = [
    { char: 'u', x: 106 },
    { char: 'e', x: 172 },
    { char: 'b', x: 238 },
    { char: 'i', x: 304 },
  ];
  const wordmarkFill = variant === 'light' ? '#030712' : '#2dd4a8';
  const badge =
    variant === 'light'
      ? `  <g>
    <circle cx="50" cy="50" r="50" fill="#2dd4a8"/>
    <g clip-path="url(#disc-clip)">
      <g stroke="#030712" stroke-width="9" fill="none" stroke-linecap="round">
        <circle cx="50" cy="50" r="30"/>
        <line x1="80" y1="50" x2="80" y2="95"/>
      </g>
      <rect x="10" y="45.5" width="80" height="9" fill="#2dd4a8"/>
    </g>
  </g>`
      : `  <g>
    <circle cx="50" cy="50" r="50" fill="#2dd4a8" mask="url(#q-knockout-mask)"/>
  </g>`;
  const defs =
    variant === 'light'
      ? `  <defs>
    <clipPath id="disc-clip"><circle cx="50" cy="50" r="50"/></clipPath>
  </defs>`
      : `  <defs>
    <mask id="q-knockout-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect x="0" y="0" width="100" height="100" fill="white"/>
      <g stroke="black" stroke-width="9" fill="none" stroke-linecap="round">
        <circle cx="50" cy="50" r="30"/>
        <line x1="80" y1="50" x2="80" y2="95"/>
      </g>
      <rect x="10" y="45.5" width="80" height="9" fill="white"/>
    </mask>
  </defs>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 346 100" width="346" height="100" overflow="visible">
${defs}
${badge}
${letterPaths(font, letters, baselineY, wordmarkFill)}
</svg>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const font = loadFont(process.argv[2]);
  writeFileSync(process.argv[3], outlineWordmark(font, '#030712'));
}
