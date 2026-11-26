# Public conference packages

The published conference is an existing platform_courses row with an existing
sales_products(kind=course) policy. Video sessions remain platform_lessons links;
no duplicate product/video/lesson is created. Public /api/media/videos now excludes
conference-linked recordings, matching /api/platform/catalog. Existing per-video
grants and playback authorization are untouched. New standalone GetPlatinum orders
for conference recordings are rejected by the existing public product gate.

GET /api/platform/conferences and /conferences/:id return only public metadata,
price, access period and published playable lessons. They never return source IDs,
player URLs or signatures. The shared RU/EN card appears in MEDIA, paid recordings
and the catalog, with /conference.html?id=:id as the detail URL. It respects the
existing currency rates and filters. The fallback cover is an explicitly branded
conference cover, not an invented photograph. Existing course covers take priority.

Checkout uses the existing purchase-offer and GetPlatinum checkout with kind=course.
Email/Telegram authentication remains on the existing account page; a sessionStorage
return reference preserves the selected conference. That reference confers no access.
Only the signed payment webhook creates one course grant. The video-grant INSERT now
explicitly requires video_id IS NOT NULL, avoiding the empty-target constraint failure
for course purchases. Duplicate events remain idempotent. Existing course membership
automatically includes new published lessons until the grant expires.

Production change: enable only the existing conference sale after backup; retain
10000 RUB / 60 days, video standalone sales off, existing global flags and site mode.
Populate blank RU/EN descriptions with factual conference-package/access text,
preserving DE and all prior purchases. No migration or real payment is required.
