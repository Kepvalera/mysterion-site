# Telegram bot + Tribute Digital Products

Separate webhook: `POST https://mysterion-international.com/api/telegram/webhook`.
Tribute webhook remains `POST https://mysterion-international.com/api/tribute/webhook`.

The existing owner-only Sales → Tribute section contains Digital Products
settings, verified product/video mapping, latest 50 receipts and manual review.
Default mode is **off**. No mappings, prices, rates, test account or payment
flags are invented or activated by migration/publication.

## Setup and connection

1. Owner: Sales → Tribute → Set up Telegram webhook. Runtime reads the existing
   `TELEGRAM_BOT_TOKEN`, verifies `getMe.username` is `MysterionAccessBot`, and
   registers the dedicated URL with `allowed_updates: [message]` and
   `drop_pending_updates: false`. A different existing webhook is not overwritten.
2. The secret header `X-Telegram-Bot-Api-Secret-Token` is a domain-separated
   HMAC-SHA256 derived from the bot token inside Cloudflare, sent only to
   Telegram's official `setWebhook.secret_token`. It is not shown, logged or
   stored in Git. No new Cloudflare Secret is needed. Token rotation requires
   repeating setup to update the webhook header.
3. Participant: Account → Profile → Connect Telegram → open bot → Start → return
   to the same site session → Check connection → confirm the displayed Telegram
   ID. The random 256-bit link expires in 10 minutes; only its hash is stored.
   Another account/session cannot confirm it. A forwarded link alone cannot
   complete the binding. Never forward the link. IDs cannot be silently rebound
   to another website account. Existing authentication/session logic is unchanged.

## Controlled purchase

1. Complete bot setup and connection for one existing test participant.
2. Set the intended video's primary price to **100 RUB** in existing Products
   and prices, after checking any old non-RUB price. Do not relabel historical
   orders. The video must already be a published paid Bunny/YouTube material.
3. Map product to video. The owner selects the official product whose `webLink`
   is `https://web.tribute.tg/p/K0l`, selects the video and access days. Product
   ID, approved/digital status, amount and RUB currency are verified server-side
   with official `GET /products/{id}`; RUB amounts use kopecks (100 RUB=10000).
   The product selector loads the first 100 digital products from the official
   API, not a guessed conversion of `K0l` into a numeric product ID.
4. Prepare controlled purchase → select only that test participant. This
   explicitly switches issuance to test mode for that single verified account.
   Public sales and Tribute Shop flags stay unchanged. Live mode additionally
   requires `TRIBUTE_DIGITAL_LIVE_ENABLED=true`, which this release never sets.
5. Pay the existing product link using the SAME Telegram account that was
   confirmed. Do not use email-only Tribute checkout for this controlled test.
   The webhook must have `telegram_user_id`; `trb_user_id` / deprecated `user_id`
   are NOT Telegram IDs. Signed email-only/W- or missing-ID purchases are queued.
6. Verify the one paid order, payment and access period, replay safety and a
   controlled refund before separately approving public/live operation. No real
   purchase or refund is created by automated tests or deployment tooling.

## Processing and safety

Raw-body Tribute HMAC and existing Shop behavior are preserved. Digital
`purchase_id` is the unique receipt key; deterministic operations and atomic
D1 batches prevent duplicate orders/payments/grants. Product, transaction,
currency, amount and stable receipt hashes are cross-checked on repeated
delivery. Mapping and buyer identity are snapshotted at first receipt. Purchases
without an existing confirmed binding remain for manual review; a later link
does not automatically claim an old payment. Unknown products, wrong prices,
disabled issuance, unavailable accounts/materials and admin blocks never grant.

`digital_product_refunded` is terminal. A delivered paid order gets a refund
ledger entry and only its `source_order_id` grant is revoked. Other purchases,
gifts, account-wide rights and administrative blocks are preserved. Refunds
received before purchases remain tombstones, preventing delayed access issuance;
their receipt history is kept without fabricating an unmatched financial order.

Existing viewer_orders/sales_orders/sales_payments/viewer_grants/sales_events and
sales_operations are reused. Provider UUIDs use a `digital:` namespace, keeping
future Shop UUID processing separate. Mapping changes to video, amount or days
are refused after receipts exist; changing an active flag does not rewrite old
orders. Existing signed Bunny playback expiration behavior is unchanged.

Additive migration `0013_telegram_digital.sql` creates only link attempts,
confirmed links, mappings, disabled settings and a receipt queue. No pre-existing
users/orders/grants/payments/access blocks or display rates are altered.

Official sources checked 2026-11-12:
- https://core.telegram.org/bots/features#deep-linking
- https://core.telegram.org/bots/api#setwebhook
- https://wiki.tribute.tg/for-content-creators/api-documentation/webhooks
- https://tribute.tg/api/v1/openapi/en (NewDigitalProductPayload,
  DigitalProductRefundPayload; telegram_user_id is optional)
