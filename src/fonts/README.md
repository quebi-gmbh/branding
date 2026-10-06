# fonts/

The build downloads `Outfit-Variable.ttf` here on first run (git-ignored).

- Family: Outfit (Google Fonts), variable font, wght axis 100–900
- License: SIL Open Font License 1.1 — free to embed and redistribute
- Source: https://fonts.google.com/specimen/Outfit
  or https://github.com/Outfitio/Outfit-Fonts/tree/main/fonts/variable
  (`Outfit[wght].ttf`, saved here as `Outfit-Variable.ttf`)

The lockup isn't set in a named weight. `scripts/outline.mjs` solves for the
weight (≈259) and size at which the u matches the q's bowl height and its
9-unit stroke, then outlines "uebi" at that instance.

The SVG sources reference this file via a relative
`@font-face src=url("./fonts/Outfit-Variable.ttf")` with `font-weight: 259.32`.
If it's missing the wordmark falls back to Inter → Helvetica Neue → Arial and
the x-height and stroke will no longer match the q.
