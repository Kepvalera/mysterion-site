# Opening-scene sprites

These four transparent WebP sprites are exports of the existing procedural textures from `heavenly.js` at source commit `6f121f5`, not new artwork. Cloud forms, planet geometry, colours and dimensions were preserved; WebP encoding used quality 0.99.

| File | Dimensions | Bytes |
| --- | --- | ---: |
| cumulus.webp | 480 x 240 | 41,192 |
| cirrus.webp | 480 x 200 | 35,578 |
| mist.webp | 480 x 220 | 35,514 |
| sphere.webp | 420 x 420 | 66,510 |

The opening scene still moves and twinkles in its existing full-section Canvas. Only the initial synchronous pixel/noise computation was replaced by image decoding. Frame rate limits, capped DPR, reduced motion, visibility pausing and the CSS crown effects remain.

The local audit can export these sprites while the former procedural implementation is checked out. They do not need regeneration during normal homepage builds.
