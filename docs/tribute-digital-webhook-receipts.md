# Tribute webhook: signed probes and Digital Products receipts

Endpoint: `POST https://mysterion-international.com/api/tribute/webhook`.

The former handler applied the Shop business envelope validator to every signed
JSON request. Missing/invalid `name`, `created_at`, `sent_at` or object `payload`
returned HTTP 400 (`invalid_webhook_data`). A signature failure returns 401,
not 400. The precise payload sent by the dashboard test button is not documented
publicly and was not captured; do not claim a particular missing field was seen.
Valid Digital Products envelopes previously returned 200 but were ignored by
the Shop processor; their event names alone did not cause HTTP 400.

The handler now authenticates the bounded raw body with HMAC-SHA256 and the
Cloudflare `TRIBUTE_API_KEY` before parsing JSON. Signed JSON objects that are
not enabled Shop business events are acknowledged without side effects. This
supports connectivity probes without assuming an undocumented test event name.
Invalid signatures still return 401; malformed JSON/non-object bodies return
400. Existing body size, origin, method and media-type checks are retained.

`new_digital_product` and `digital_product_refunded` are explicitly receipt-only:
HTTP 200, no D1 reads/writes, no orders, grants or revocations, including on
duplicate delivery. This remains true even if Shop processing is enabled later.
Existing enabled Shop validation and idempotent processing are unchanged.
No migrations, keys or Cloudflare settings are changed by this release.

Digital Products (`/p/...`) and Shop orders (`/shop/orders`) have different
contracts. Digital payloads use `product_id`, `purchase_id`, `transaction_id`,
and Tribute buyer identifiers; they do not provide a verified site viewer UUID.
Before enabling automatic access, implement and verify:

- Explicit approved `product_id` → local video/course mapping and price/currency
  validation (amounts are in minor currency units).
- A verified binding between the Tribute buyer identity and an existing site
  account; a static product link or arbitrary URL parameter is insufficient.
- A durable unique purchase ledger keyed by `purchase_id`, atomic order/grant
  processing, and refund handling restricted to that purchase's grant.
- Refund-before-purchase/retry handling and isolated end-to-end tests before
  separately approving any payment/access activation.

Official sources (checked 2026-11-12):

- https://wiki.tribute.tg/for-content-creators/api-documentation/webhooks
- https://wiki.tribute.tg/for-content-creators/info-products-and-content/api-integration
- https://tribute.tg/api/v1/openapi/en (current purchase/refund schemas)

The guide's minimal purchase example lacks some fields required by the current
OpenAPI schema. Receipt-only acceptance supports both without mistaking either
for a mapped Shop purchase. No raw request bodies, buyer identities, signatures
or secret values are logged or stored by this handler.
