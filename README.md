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
│   ├── outline.mjs              ← Outfit-Light TTF → SVG <path> data
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

First run downloads `Outfit-Light.ttf` (SIL OFL) into `src/fonts/`.
The build outlines the `<text>` in the lockup/wordmark SVGs into `<path>`
data so all rasterisation is font-independent and byte-reproducible.

## What the build produces

Everything listed in `src/tokens.json → exports`:

| Bucket | Files |
|---|---|
| `dist/svg/` | `q-light.svg`, `q-dark.svg`, `lockup-light.svg`, `lockup-dark.svg`, plus `*-outlined.svg` intermediates |
| `dist/png/` | `q-{light,dark}-{16..1024}.png`, `q-dark-{…}-transparent.png`, `lockup-{light,dark}-{16..1024}.png` |
| `dist/favicon/` | `favicon.ico` (16/32/48), `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180, light on white squircle), `android-chrome-{192,512}.png` (dark on dark squircle), `site.webmanifest` |
| `dist/` | `manifest.json` (path/bytes/sha256 for every file) |

## Releases

Push a tag like `v1.0.0` and the `release` workflow builds `dist/`, zips it
to `quebi-branding.zip`, and attaches the zip to a generated GitHub Release.
Manual runs (`workflow_dispatch`) produce the same zip as a CI artefact.

---

# Design system (authoritative)

Two pinned variants. Two colours total: `#030712` and `#2dd4a8`.

| Variant | Surface   | Disc      | q-glyph              | "uebi"    | Construction |
|---------|-----------|-----------|----------------------|-----------|--------------|
| light   | `#ffffff` | `#2dd4a8` | `#030712` (painted)  | `#030712` | opaque       |
| dark    | `#030712` | `#2dd4a8` | knockout (transparent) | `#2dd4a8` | knockout   |

**Light** — on white paper: mint disc with a black "q" cut into it, black
"uebi". Safe for print, photocopies, single-ink runs (black plate + mint
spot).

**Dark** — on dark surface: mint knockout disc where the "q" is cut through
to the surface, "uebi" in mint. On varied/photographic backgrounds the
cut-out reveals whatever is behind the badge — that's the point of the
knockout.

## Master grid

All values in SVG user units (badge is a 100×100 box):

- **disc**: circle r=50 centred at (50,50)
- **bowl**: circle r=30 centred at (50,50), stroke weight 9
- **descender**: line (80,50) → (80,95), stroke 9, `stroke-linecap="round"`
- **cut slot**: rect x=10 y=45.5 w=80 h=9 (height matches stroke weight)
- **wordmark**: Outfit Light (300), `font-size="115"`,
  `dominant-baseline="middle"` anchored to y=50
- **letter x-origins** (inside a 240×100 wordmark box): 0 / 66 / 132 / 198
- **lockup x-origins** (inside a 346×100 lockup box): 106 / 172 / 238 / 304

The q's cut slot and the e's crossbar are mathematically colinear at y=50.
The "e" deliberately carries no cut band — its own crossbar already reads
as the cut line.

## Construction notes

- **Opaque (light)**: disc is painted mint, q is painted in `#030712` on
  top, then a mint rect paints the cut slot back over the q. Descender is
  clipped to the disc so the tail can't protrude.
- **Knockout (dark)**: mint disc, with a mask that removes the q glyph
  (bowl + descender strokes) from the disc. The cut slot stays as disc
  material — it bridges the knocked-out bowl.
- Both constructions share identical geometry; only paint style differs.

## Usage guidelines

- Don't tint, gradient, or outline the marks. Two colours only.
- Don't use the light variant on dark backgrounds or the dark variant on
  light backgrounds — pick the construction that matches the surface.
- For photographic or busy surfaces, use the **dark variant**: the
  knockout lets the background show through the q and anchors the mark
  visually.
- For single-ink print runs, use the **light variant**: black plate +
  mint spot.
- Minimum sizes: badge-only renders crisp down to 16px. The full lockup
  is only exported from 180px up — below that, "uebi" loses legibility
  and you should use the badge alone.
- App icons: use the squircle variants from `dist/favicon/` (iOS-style
  rounded-rect container, radius = 20% of side).

## Font

Outfit (Google Fonts, SIL OFL 1.1). The build downloads `Outfit-Light.ttf`
automatically and outlines the `<text>` into `<path>` data, so shipped
assets have no font dependency. Human-editable source SVGs keep live
`<text>` and reference the font via `@font-face` for authoring.

## Visual reference

After `pnpm run build`, open `dist/readme.html` — it's a fully styled
showcase of every generated asset alongside this guide, built from the
same sources. It ships inside the release zip so downstream consumers
get a self-documenting bundle.
