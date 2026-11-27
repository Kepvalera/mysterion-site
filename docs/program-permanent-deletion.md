# Safe permanent deletion of archived programs

Prepared against Production `82f7f94254c65d49290b39da37cf91cce48bd24c`. Local implementation only; Production publication requires separate owner approval.

## Existing behaviour and change

Normal Delete remains compatible with the current lifecycle: programs with lessons, orders, grants, child streams or seminar settings are archived. Previously, seminar settings alone made an otherwise empty test seminar permanently remain in that archive.

Archived rows now offer a separate **Delete permanently** action. The confirmation names the selected program, warns that deletion is irreversible, and states that Bunny files are retained. Cancelling sends no request. Active rows do not offer the permanent action. The list has Active / Archive / All filters, defaults to Active, and keeps its selected filter during actions. Restore remains available in Archive.

## Server protection

`POST /api/platform/admin/courses/:id/delete-permanently` requires the existing owner authentication, same-origin CSRF checks, current revision, archived state and matching RU/EN confirmation title.

Deletion is denied if any registrations, orders (including pending, rejected or cancelled history), payments, refunds, receipts, grants (including expired/revoked history), access blocks, financial/access operation history, lessons (including drafts/planned recordings), linked videos or child streams exist. The video/lesson relationship is checked through the existing lesson model; no new media relationship is invented.

The dependency predicate is checked again inside the existing D1 atomic batch before its audit receipt is created. A new dependency or revision change after the preflight check makes all deletion statements no-ops. Foreign keys provide an additional safeguard. The operation preserves its audit receipt with `course.purged` and the program ID, without recording private Zoom values.

Only an empty archived program's own settings are removed: Zoom settings, speaker image, event metadata, cover, program metadata, its unused sales configuration and program row. No registration, order, payment, grant, lesson, user or video deletion is performed. There are no Bunny API calls.

## Tests and rollout

Tests use isolated SQLite, local native Cloudflare D1 and Chrome. They cover empty programs of all supported types, seminar configuration cleanup, cancellation, owner/CSRF/revision guards, registrations, pending orders, payments/refunds, active/expired/revoked grants, draft and published lessons, Bunny bindings, child streams, access history, a concurrent dependency, archive restoration, purchased conference playback rights, filters, RU/EN and phone/desktop layouts.

No schema migration or automatic data cleanup is needed. Existing Production data remains unchanged until an owner explicitly confirms an eligible archived program's permanent deletion after an approved deployment. That deletion is intentionally irreversible; routine Production backup retention remains necessary for operational recovery. No Production deletion or publication is part of preparing this patch.
