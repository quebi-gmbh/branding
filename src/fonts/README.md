# fonts/

Drop `Outfit-Light.ttf` here before running the build.

- Family: Outfit (Google Fonts)
- Weight: 300 (Light)
- License: SIL Open Font License 1.1 — free to embed and redistribute
- Source: https://fonts.google.com/specimen/Outfit
  or https://github.com/Outfitio/Outfit-Fonts/tree/main/fonts/ttf

Expected file:
```
fonts/Outfit-Light.ttf
```

The SVG sources reference this file via a relative `@font-face src=url("./fonts/Outfit-Light.ttf")`.
If it's missing the wordmark falls back to Inter → Helvetica Neue → Arial and the
x-height, crossbar position, and letter widths will no longer align with the q's cut.

The build script's FIRST step must either:
1. confirm `Outfit-Light.ttf` exists here, or
2. outline the text to paths via `fonttools` / `inkscape` and write
   `src/uebi-wordmark-outlined.svg`, `src/lockup-{light,dark}-outlined.svg`
   which the downstream rasterisation steps should use instead.
