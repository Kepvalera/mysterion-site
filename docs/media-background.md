# MEDIA cinematic background

One authorized promotional clip: 16 s, silent H.264, 960×540, 24 fps, faststart, 2,695,373 bytes.
Source and editing permission were confirmed by the owner for https://www.youtube.com/watch?v=fld9gjLrOVM.
Only the prepared montage and WebP poster are published; the full source is not included.

The background layer is fixed below the existing header. The hero uses viewport height minus
header height (stable viewport units on mobile). The catalog transitions to a light background.
Scrolling never changes the MP4 source, unloads it or resets currentTime. One player has
autoplay/muted/loop/playsinline and no controls. Hidden tabs pause it; foreground playback resumes on return. Opening a dialog does not pause it.
Reduced motion and explicit data-saving preferences use a static poster and never request the MP4. Network speed estimates (effectiveType, RTT, downlink) do not disable playback. Unexpected pauses resume automatically; transient network errors have at most two reload attempts, preserving the playback position.
Autoplay/media/config failures retain the poster. Card reveal only adds decorative classes;
existing card markup, filters, prices, access checks and checkout are unchanged.

## R2 setup by the owner

Production currently has no MEDIA_PROMO_BUCKET binding. The approved bundled clip works
without it. Upload, replace and enable/disable controls require the following setup:

1. Cloudflare → R2 Object Storage → Create bucket: `mysterion-media-promo-production`.
   Store only public promotional material here. Leave public r2.dev access disabled.
2. Workers & Pages → mysterion-international → Settings → Bindings → Add binding → R2 bucket.
   Environment: Production. Variable name: `MEDIA_PROMO_BUCKET`. Select the bucket above.
3. Create a new Production deployment of the existing approved commit so Functions receive the binding.
4. Sign in as owner at /admin-media → Settings → Media page: video background.
   Upload a silent MP4 and poster, confirm public usage rights, enable and save.
   To stop the bundled or uploaded background, uncheck Enable and save.

Use a separate bucket if testing uploads in Preview. No R2 public domain or API key is needed.
No Cloudflare Secret, D1 migration, existing database field or Bunny object is changed.
The site serves only the referenced assets through its own endpoint. Replacement turns the
background off until explicitly enabled. Revision checks prevent overwriting another tab.
Only the owner may manage files; existing session and CSRF verification remain mandatory.

Limits: MP4 H.264, no audio track, 1–30 s, max 1920×1080 / 12 MiB; recommend 10–20 s.
Poster JPEG/PNG/WebP, max 2 MiB. All uploaded files must be suitable for unrestricted public access.
Settings and uploaded files live only in the dedicated R2 bucket, outside D1 and Bunny.
