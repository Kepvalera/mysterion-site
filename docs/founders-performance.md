# Founders cloud performance — 2026-11-07

## Audit and changes

The previous `paintFoundersClouds()` synchronously generated three 640 x 320 Canvas textures during `home.js` execution: 614,400 pixels, repeated multi-octave noise and seven exponential lobe evaluations per pixel. It ran once per page load, **not once per frame**, and added no requestAnimationFrame loop. This was a concrete startup blocking risk. Continuous freezing reported on a physical phone could not be reproduced on this desktop host.

Founders had no CSS blur and did not animate background-position, sizes, filter or shadow values. However, it retained a redundant moving radial-gradient layer, large cloud surfaces, foreground masks and 16 animated stars. Masks, scaling and transparent surfaces increase compositing cost; GPU cost was not directly measured. The unrelated about-section blur and the hero/crown implementation were preserved.

The cloud generator and cloud Canvas elements have been removed. Three cached instances of a transparent WebP now form the desktop scene, with two on mobile. A picture/media source forces the 480 x 160 image on phones even at high DPR; desktop uses 960 x 320. The texture is 17,864 / 49,596 bytes. Approximate decoded RGBA image sizes are 0.29 / 1.17 MiB, excluding compositor surfaces. All instances use the same URL and can share its decoded resource.

Cloud edges, shading and wisps are baked into the image. No cloud CSS filter, mask, runtime raster generation, or extra animation loop remains. Only translate3d is animated, with 34 / 42 / 54 second eased alternating cycles. Endpoints reverse smoothly, without a reset jump. Mobile also hides eight stars and stops the secondary orbit animation. The halo's redundant mask was removed without reducing cloud opacity. IntersectionObserver and visibilitychange pause and resume background animations; reduced motion keeps static clouds visible.

Portrait assets, text, translations, dimensions and the #A47C39 heading were preserved. Decorative cloud images retain empty alt text when the language switches.

## Measurement method and limits

Headless Chrome on the same Windows desktop host, viewport emulation at 390 and 1440 px, DPR 1, no CPU throttling. Fonts and visible images were decoded before sampling. Each viewport had separate four-second idle and scripted scrolling samples. PerformanceObserver recorded main-thread tasks over 50 ms; CDP Performance metrics recorded task time and JS heap. Screenshots were taken in a separate phase, after warm-up, at relative 0 / 3 / 6 / 10 seconds.

**The FPS below measures requestAnimationFrame callback cadence on this host (~240 Hz). It is not presented GPU-frame throughput or a promise of 240 FPS on an iPhone.** Chrome emulation does not reproduce phone GPU, battery, heat, Safari or memory pressure. Neither physical Safari nor physical Chrome on iPhone was available. Sampling noise and unrelated page animations remain. A single run does not establish a universal performance gain.

## Final measurements

| Viewport / phase | rAF samples/s | Mean interval, ms | p95, ms | Maximum, ms | Intervals >50 ms | Main-thread task time before → after, s / 4 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 390 idle | 239.7 | 4.17 | 4.40 | 8.30 | 0 | 0.641 → 0.525 |
| 390 scroll | 239.2 | 4.18 | 4.40 | 16.60 | 0 | 0.800 → 0.655 |
| 1440 idle | 240.0 | 4.17 | 4.40 | 4.50 | 0 | 0.646 → 0.545 |
| 1440 scroll | 240.0 | 4.17 | 4.40 | 4.50 | 0 | 0.775 → 0.779 |

No long tasks occurred during the final steady animation or scrolling samples. Desktop scrolling task time was effectively unchanged; no improvement is claimed there. Mobile task time fell about 18% in this run, desktop idle about 16%.

Largest observed startup long task: 708 → 212 ms at 390 px; 644 → 201 ms at 1440 px. These are page-level measurements, not isolated attribution of every task to clouds. Other page startup tasks remain.

Final CDP JS heap: 1,033,864–1,100,516 bytes (~0.99–1.05 MiB). This excludes decoded images, native browser memory and GPU allocations. performance.memory returned a rounded 10,000,000-byte value and was not used as a precise memory measure. Comparable baseline CDP heap was not collected, so no heap reduction percentage is claimed.

## Visual and functional checks

- Both visible mobile WebP layers and all three desktop layers decoded successfully; unused mobile middle layer remained hidden.
- Cloud transforms changed at 0 / 3 / 6 / 10 seconds, while portrait bounds remained identical.
- Offscreen state was paused; scrolling back resumed it. Reduced motion reported zero founders animations.
- RU/EN/DE retained #A47C39 and no horizontal overflow; no JavaScript exceptions were observed.
- Reviewed the final mobile and desktop screenshots: recognizable cumulus forms, natural blue-lavender shading, open faces and text, no foreground fog filter.

Raw JSON and screenshot sequences are local review artifacts in `output/founders-performance/` and are not shipped to the site.

## Reproduce

From the project root, on Windows with Chrome installed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/measure-founders.ps1 -Mode after
```

`-Mode baseline` measures the checked-out source as-is; it does not restore the former implementation. `-Mode assets` rebuilds WebP derivatives from the supplied transparent PNG with browser Canvas, only as a build-time operation. No Canvas cloud generation is delivered to visitors.
