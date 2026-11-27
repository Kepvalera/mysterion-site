# Online seminars and announcements

Implementation base: Production commit `2142c3bf41ee504f00170bf2c886c1c0bc99253e`.
This feature is prepared locally. Production deployment and Production migration require the owner's separate approval.

## Owner workflow

1. Courses and lessons → Add course → Online seminar. Enter RU/EN title, description and programme, cover, RUB price or free access. Save the programme. The programme's existing publication and sale controls remain authoritative.
2. On its row choose Online seminar settings. Set local date/time, IANA timezone, duration, speaker/photo, optional capacity, Zoom opening time, publication announcement, registration and lifecycle. Zoom URL/password fields are write-only; empty fields retain their values.
3. Publish the programme and explicitly open registration. Homepage announcements use the same programme ID and `/program.html?id=…`; Events uses the same catalog. No duplicate product is created.
4. Participants shows 25 records per page, names, available email/Telegram ID, registration time, order/payment/access state and total registrations. Export CSV neutralizes spreadsheet formulas; the export limit is 10,000 records.
5. Manual participation grant/revoke uses existing grants/blocks and operation history. No payment is fabricated. A webinar's Zoom block does not block independently granted video rights.
6. Mark the event Completed after the meeting. To attach a recording use Add lesson → existing protected video. A free webinar can also attach an existing paid/protected recording. Direct upload for a free webinar is deliberately blocked: it must not create a publicly playable copy. Paid webinar uploads retain the existing uploader and draft selection.
7. Give a participant recording access with the separate Recording access action, selecting an attached published video and an explicit number of days. It creates an independent video grant; no automatic recording/future-lesson inheritance occurs.

## Registration, seats and money

- Registration requires the existing verified email or verified Telegram account and current server session. No auth implementation is replaced.
- Free registration creates one registration and a course participation grant, without any payment order.
- Paid registration uses existing GetPlatinum checkout, server-side RUB price, receipt contact form and signed webhook. Seminar participation lasts until the meeting ends, independently of recording days. Existing programs keep their original policies.
- A unique event/account registration and unique bound order prevent duplicate registrations/orders. A ready payment can be resumed from the account without creating a second order.
- SQLite/D1 triggers reserve the seat and bind the order inside the existing atomic order transaction. The event revision and original product revision are checked. Concurrent registrations cannot exceed capacity.
- **Reservations are conservative:** failed, uncertain, abandoned and refunded payment attempts retain their seats. There is no timeout-based or automatic seat release. This prevents a late payment from competing with a re-sold seat. The owner may raise capacity; lowering it below current reservations is rejected. Failed/uncertain payments require organiser review; no replacement charge is silently created.
- A valid late payment settles its original order only. If the event/access period has ended it requires review, with no Zoom access. A provider redirect alone grants nothing.
- Any confirmed monetary GetPlatinum refund revokes only that order's seminar participation grants, including refund-before-payment. An independent manual participation grant or recording grant remains valid. Unknown/incomplete refund data is not treated as proof of a refund. Pending-to-confirmed refund transitions and delayed pending replays are handled for webinars, retaining both events in payment history. Existing non-webinar refund rules are unchanged.
- No actual payments, refunds, Zoom meetings or Bunny deletions are part of the test suite.

## API and private information

Public: `GET /api/platform/events`, `GET /api/platform/events?home=1`, existing programs API, and published speaker images. All public responses use explicit allowlists; there are no Zoom URLs/passwords.

Authenticated participant:

- `GET /api/platform/events/mine`
- `GET /api/platform/events/:courseId`
- `POST /api/platform/events/:courseId/register`
- `POST /api/platform/events/:courseId/payment` (resume existing payment only)
- `POST /api/platform/events/:courseId/zoom`

Zoom is returned only by the closed POST after rechecking session, grant, order/refund state, administrative block, event lifecycle and opening/end time. No Zoom API is used. The ordinary meeting URL is transferable once disclosed to a legitimate participant; enable Waiting Room and a Zoom password. Passwords and links are never included in public HTML/API, action history or error messages. Private responses are no-store. The existing participant account displays the meeting password only after authorized Join Zoom.

Owner-only, existing admin auth and CSRF:

`/api/platform/admin/events/:courseId`, plus `/speaker-photo`, `/participants`, `/csv`, `/grant`, `/revoke`, `/recording`.

## Additive migration and backup

`0024_program_events.sql` adds event metadata, separate secrets, registrations, speaker images and scoped admission/refund triggers. It does not rewrite existing rows. Programs with existing orders or grants cannot be converted into webinars. Webinars are archived through the existing lifecycle rather than physically deleted.

A private D1 export was downloaded before local migration rehearsal; its SHA-256 is checked and it is restored into isolated SQLite. The SQL file is outside the repository source, with restricted filesystem permissions. Before an approved Production rollout, take a fresh export again and compare the latest commit/migrations. Never commit a database export.

Publication prerequisites: separate owner approval; fresh backup and verified restore; confirm main is still the tested base or rebase/retest; apply only 0024 and record it once in d1_migrations; deploy the tested code through the existing GitHub → Pages process. No new secrets, Zoom integration, services or payment provider flags are required. Do not automatically create or publish example seminars.

## Rollback

Before any event registrations/orders/grants exist, the application can return to the base version while leaving the additive schema empty and intact.

**After event activity exists, never deploy the old entitlement code:** it would interpret course participation grants as recording access. Close registrations and use a forward fix retaining event recording-isolation checks and private endpoint protection. Keep all registration/order/grant history. Do not drop tables/triggers or restore a whole old database over current live payments. Any later destructive recovery needs a separately reviewed plan and owner approval.

## Verification limits

Automated tests use isolated SQLite, Chrome and mocked provider responses. They cover free/paid flow, genuine signature code, deduplication, capacity races, late/uncertain payments, refunds, separate recordings, CSRF, public secrecy, CSV and RU/EN/mobile layouts. They do not verify a real Zoom room's availability or a real bank charge. Those checks require an approved staging/control event after publication approval.
