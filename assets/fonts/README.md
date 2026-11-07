# Local fonts

The site's existing families are self-hosted to remove the render-blocking Google Fonts CSS dependency. No new typeface was introduced.

- Cormorant Garamond: normal 500–700, italic 500–600; Google Fonts API version v21.
- Manrope: normal 400–800; Google Fonts API version v23.
- Latin, Latin Extended, Cyrillic and Cyrillic Extended subsets use the original Google Fonts unicode ranges. Only subsets needed for the page's glyphs are fetched by the browser.
- `font-display: swap`; two first-screen serif subsets are preloaded on the homepage. DM Sans was requested by the old import but never used by the project and is no longer requested.

Retrieved from the official Google Fonts CSS API for these families and weights. License texts are `cormorantgaramond-OFL.txt` and `manrope-OFL.txt`, copied from the corresponding `ofl/` directories of the official `google/fonts` repository. Keep the licenses with the files.
