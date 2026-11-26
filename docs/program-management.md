# Programs, schools and streams

All program pages use `/program.html?id=COURSE_ID`. The legacy
`/conference.html?id=COURSE_ID` remains functional for existing conference links.
No per-product HTML or duplicated payment system is required.

## Owner workflow

In **Courses and lessons → Add course**, select Conference, Online school,
School stream, Course, Video collection or Seminar. Enter RU/EN title,
description, RUB price, access period, publication state, display order and
program content. Upload the cover using the existing course-cover field.
New sales default to off; enabling sale explicitly uses the existing provider.

A school can group independently priced/access-controlled streams numbered 3–6.
Create the school first, then choose it in each stream's Parent school field.
Each stream has its own page, lesson list, price and grant. A school purchase does
not silently grant access to independently sold streams. A school may also contain
its own lessons; its purchase covers its own list, as with every other program.

Copy the public link from the program record. Add existing recordings or upload
directly into the program using the existing TUS uploader. A stable lesson draft
is saved before uploading. The final save and retries reuse the existing lesson
and Bunny video. Losing a final response never starts another upload for a Ready
published video. Successful uploads reset the next-recording IDs.

For a planned lesson choose Planned recording and publish its title. Its public
status is Coming soon, and it does not increase the recording count. Draft lessons
remain private. Processing Bunny files have a processing status with no playback;
Ready but unpublished files have a preparing-for-publication status.

Published recording counts include only published, ready videos. Duration totals
are labelled partial when some published recording lengths are unknown. Speakers
come from the existing video speaker field. New Bunny status syncs store provider
duration. Existing recordings can be refreshed through Refresh Bunny durations;
each request performs only one provider GET and stores duration metadata. No new
Bunny objects are created. Known durations for non-Bunny videos can also be entered in the video editor. Bunny duration is read-only and comes from the provider.

Edit a lesson to change its program or position. Moving a lesson out of a program
with any purchases/grants is rejected, including an atomic recheck at update time.
This avoids silently removing previously purchased content. Deleting a lesson from
a purchased/granted program unpublishes it and retains progress/material history.

## Compatibility and migration

Migration `0022_program_metadata.sql` adds program_settings, video_metadata and a
unique (course_id,video_id) lesson-link index. It does not rebuild or rewrite old
tables. Legacy school rows with stream 3–6 are treated as streams; the original
database kind/stream semantics are retained. New parent schools and bundles use
the existing `course` kind plus metadata. Old DE translations remain intact.

The existing sales_products `course` policy, viewer_orders, signed GetPlatinum
webhook and viewer_grants are reused for every program type. One paid order creates
one program grant; additions become available while that grant remains active.
Historical prices/periods are not recalculated. Per-video access is always checked
on the server, including expiry, refunds and administrative blocks.

Program recordings are hidden from standalone catalogs unless the owner explicitly
enables their individual sale. Existing standalone grants remain valid. Neither
GetPlatinum nor Tribute configuration is changed by this release. Test programs
exist only in isolated local fixtures. Production migration requires a verified
private backup, local restore rehearsal, duplicate-link check and unchanged-table
verification. No real test payments, test programs or grant changes are made there.
