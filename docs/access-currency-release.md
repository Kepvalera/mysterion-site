# Access management and display currencies (2026-11-12)

Existing admin sections `/admin-media` → Access and Sales → Access share
`admin/access`. Default filter: active; archive filters: expired/revoked/all.
Name/email search and all-material participant detail use server pagination,
25 rows per page. Future non-expired grants remain listed with their start date.
Restore, extend and revoke use existing atomic sales operations and revision
checks, with actor/action history in Sales → History. Restoring a paid grant
requires its original order still to be paid. Extending a revoked grant does
not silently restore it; extend first, then explicitly restore when appropriate.

Administrative revocation also adds a viewer/material block, preventing another
grant or course entitlement from bypassing a video block. No purchase/refund
state is changed. Restoring removes that material block. Server access checks
and library/availability metadata respect blocks. Previously issued signed
Bunny URLs remain valid until their existing short expiry (up to 180 seconds).

Migration `0012_access_currency.sql` only creates access blocks, manual display
rates and a grant lookup index. Existing records and historical amounts are not
updated. Rates start unset; no exchange rates or purchases are invented.

Sales → Products and prices uses a base RUB price. Existing non-RUB paid
products require explicit confirmation of a newly entered RUB price; no silent
currency relabeling. The general editor defaults new materials to RUB, while
preserving the recorded currency of old materials. Historical order/payment
screens use the order's recorded currency, not a hardcoded RUB label.

Public currency selection starts at RUB on each page load. EUR/USD are available
only when an owner manually sets RUB per currency unit in Products and prices.
Conversion affects current RUB product display only, with ≈ / estimated-price
labels; historical purchases and actual non-RUB product prices are not converted
or relabeled. Unknown currencies are marked unconfirmed. Checkout payloads,
Tribute integrations, payment flags and secrets are unchanged.
