# Founders cloud textures

`pearl-cloud-source.png` is the transparent master. Only the responsive WebP derivatives are served on the homepage:

- `pearl-cloud-480.webp`: 480 x 160, 17,864 bytes.
- `pearl-cloud-960.webp`: 960 x 320, 49,596 bytes.

WebP quality 0.86; transparency and soft edges preserved. Desktop uses three instances of the same cached image, mobile uses two. No runtime texture generation or Canvas is needed. Animations use only translate3d over 34/42/54 second alternating cycles, pause offscreen/in hidden tabs, and stop under reduced motion. Alternating eased endpoints avoid a loop jump.

Created with the built-in imagegen tool. No portrait or person was supplied or edited.

Prompt:
> Use case: photorealistic-natural. Asset type: transparent cloud texture for a premium celestial website. Generate ONLY one isolated horizontal bank of exquisite realistic sunlit cumulus clouds on genuine alpha transparency. Wide 3:1 composition, centered, fully contained with generous transparent padding all around. Several interconnected pillowy billows, detailed small wispy edges, convincing volumetric depth, pearly white tops, subtle ice blue and pale lavender undersides, extremely delicate warm sunlight rim at upper left. Clear recognizable cumulus forms, natural photographic aerial quality, no flat fog, no gray smoke. Keep cloud bank low and broad, about 60 percent width of image and 45 percent height, no crop at edges. Transparent background, no sky, horizon, landscape, people, symbols, text, stars, frames, checkerboard or solid backdrop. Restrained natural highlights, no harsh bloom.
