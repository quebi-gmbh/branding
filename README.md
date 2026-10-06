# quebi · branding

Source SVGs, build pipeline, and release bundles for the quebi hybrid logo
lockup. Consumers should pull ready-made assets from the
[GitHub Releases](../../releases) page — this repo is the upstream that
produces them.

```
.
├── src/                         ← authoring sources (SVG + tokens.json + font slot)
├── dist/                        ← generated artefacts (git-ignored)
├── scripts/
│   ├── build.mjs                ← pipeline: outline text → SVG + PNG + ICO
│   ├── outline.mjs              ← Outfit variable TTF → SVG <path> data
│   ├── package.mjs              ← zips dist/ for release
│   └── test.mjs                 ← validates dist/ (manifest hashes, coverage)
└── .github/
    ├── workflows/               ← ci (push/PR) + release (tags)
    └── dependabot.yml
```

## Install & build

```bash
pnpm install
pnpm run build              # populates dist/
pnpm run build:clean        # wipes dist/ first
pnpm run package            # build + zip → quebi-branding.zip
```

First run downloads the Outfit variable font (SIL OFL) into
`src/fonts/Outfit-Variable.ttf`.
The build outlines the `<text>` in the lockup/wordmark SVGs into `<path>`
data so all rasterisation is font-independent and byte-reproducible.

## What the build produces

Everything listed in `src/tokens.json → exports`:

| Bucket | Files |
|---|---|
| `dist/svg/` | `q-light.svg`, `q-dark.svg`, `lockup-light.svg`, `lockup-dark.svg`, plus `*-outlined.svg` intermediates |
| `dist/png/` | For each badge size: `q-{light,dark}-{size}.png` (transparent), `q-{light,dark}-{size}-on-light.png` (#ffffff), `q-{light,dark}-{size}-on-dark.png` (#030712). Lockups 180–1024: `lockup-light-{size}.png` on paper, `lockup-dark-{size}.png` transparent |
| `dist/favicon/` | `favicon.ico` (16/32/48, light mark), `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180, light mark on white squircle), `android-chrome-{192,512}.png` (dark mark on ink squircle), `site.webmanifest` |
| `dist/` | `manifest.json` (path/bytes/sha256 for every file) |

## Releases

Push a tag like `v1.0.0` and the `release` workflow builds `dist/`, zips it
to `quebi-branding.zip`, and attaches the zip to a generated GitHub Release.
Manual runs (`workflow_dispatch`) produce the same zip as a CI artefact.

---

# Design system (authoritative)

Source of truth: [`quebi-design-system.html`](quebi-design-system.html)
(open it in a browser). The logo is **Ink & Paper** — mint/teal is retired
and must not appear anywhere.

| Token     | Hex       |
|-----------|-----------|
| `ink-950` | `#030712` |
| `gray-50` | `#f9fafb` |
| `white`   | `#ffffff` |

Two pinned variants, named for the ground they sit on:

| Variant | Ground    | Lockup (`lockup-*`)                         | Mark (`q-*`)                         |
|---------|-----------|---------------------------------------------|--------------------------------------|
| light   | `#ffffff` | `ink-950` knockout disc + `ink-950` "uebi"  | `ink-950` disc, `white` q (opaque)   |
| dark    | `#030712` | `gray-50` knockout disc + `gray-50` "uebi"  | `gray-50` disc, `ink-950` q (opaque) |

**Lockup** — single ink. The q is cut through the disc, so the ground shows
through it; "uebi" is set in the same ink. Prints with a single black plate.

**Mark** — the round q on its own, for app icons and avatars. Two inks: the
q is painted on the disc, so it reads the same on any ground.

These correspond to the design system's `quebi-wordmark-ink` /
`quebi-wordmark-light` (lockups) and `quebi-mark-ink` / `quebi-mark-light`
(marks), rebuilt here as vectors.

## Optical sizing

The q's stroke thickens at small raster sizes so the mark reads crisp at
favicon sizes instead of aliasing into a blur. The `build.mjs` pipeline
generates the badge SVG fresh per output size using the bucket it falls
into:

| Size bucket | stroke-width | cut height |
|---|---|---|
| ≤ 24 px | 14 | 14 |
| 32 – 96 px | 11 | 11 |
| ≥ 128 px | 9 (default) | 9 |

Bowl and descender geometry stay identical — only the stroke weight and
matching cut-slot height change. The default (9) is what the source SVGs
in `src/` carry and what gets copied into `dist/svg/`.

## Master grid

All values in SVG user units (badge is a 100×100 box; the lockup's disc
uses the same box).

Both the mark (`q-*`) and the lockup (`lockup-*`) use the same q:

- **disc**: circle r=50 centred at (50,50)
- **bowl**: circle r=30 centred at (50,50), stroke weight 9
- **descender**: line (80,50) → (80,95), stroke 9, `stroke-linecap="round"`
- **cut slot**: rect x=10 y=45.5 w=80 h=9 (height matches stroke weight)

**Lockup**: the type is fitted to the q. The build derives these values
from the Outfit variable font (`scripts/outline.mjs → lockupGeometry`); the
numbers below are what it produces.

- **wordmark**: Outfit at **wght 259.32**, `font-size` 144.35. That's the
  only weight/size pair where the u is exactly as tall as the bowl's outer
  edge (y=15.5 → 84.5: flat top to round bottom) *and* its stems are exactly
  9, the q's stroke. Baseline at y=83.06, which puts the u's ink centre on
  y=50.
- **e crossbar**: lands at y=44.95 → 52.60 (7.65 thick), just inside the top
  of the q's cut slot (45.5 → 54.5).
- **letter x-origins**: 107.22 / 190.08 / 272.93 / 355.79 (pitch 0.574 em;
  0.111 em gap from the disc to the u's ink).
- **viewBox**: `0 -18.86 377.44 118.86`. It starts above the disc so the b
  ascender isn't clipped.

The "e" carries no cut band; its crossbar echoes the q's cut slot.

## Construction notes

- **Opaque (marks)**: disc is painted, the q is painted on top in the
  other ink, then a rect in the disc colour paints the cut slot back over
  the q. Descender is clipped to the disc so the tail can't protrude.
- **Knockout (lockups)**: a single-ink disc with a mask that removes the q
  glyph (bowl + descender strokes). The cut slot stays as disc material —
  it bridges the knocked-out bowl.
- Both constructions share identical geometry; only paint style differs.

## Usage guidelines

- Don't recolour, tint, gradient, outline, stretch, or add effects to the
  marks, and never retype the wordmark — use the exported files.
- Don't use the light variant on dark backgrounds or the dark variant on
  light backgrounds — pick the variant that matches the ground.
- Keep clear space of at least the height of the q around the logo.
- For single-ink print runs, use the **light lockup**: one black plate.
- Minimum sizes: badge-only renders crisp down to 16px. The full lockup
  is only exported from 180px up — below that, "uebi" loses legibility
  and you should use the badge alone.
- App icons: use the squircle variants from `dist/favicon/` (iOS-style
  rounded-rect container, radius = 20% of side). The favicon uses the light
  (ink) mark, which reads on both light and dark browser tabs.

## Font

Outfit (Google Fonts, SIL OFL 1.1), variable font. The build downloads
`Outfit-Variable.ttf` automatically, picks the weight that fits the q (see
Master grid), and outlines the `<text>` into `<path>` data, so shipped
assets have no font dependency. Human-editable source SVGs keep live
`<text>` and reference the font via `@font-face` for authoring.

## Visual reference

After `pnpm run build`, open `dist/readme.html` — it's a fully styled
showcase of every generated asset alongside this guide, built from the
same sources. It ships inside the release zip so downstream consumers
get a self-documenting bundle.
