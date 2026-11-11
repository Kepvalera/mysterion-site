# Bot sign-in and return to a selected recording

Public sales stay closed; the existing owner-selected controlled test scope is preserved. This
release does not enable payment flags, create real payments, change Bunny or
merge existing accounts. Shop order processing is untouched.

## Browser → bot → existing session system

`POST /api/viewer/telegram/start` requires same-origin/CSRF headers and is rate
limited. It creates separate random 256-bit bot and browser proofs. The browser
proof is an HttpOnly, Secure, SameSite=Lax __Host cookie. Only hashes are stored.
The challenge lasts 10 minutes and contains a validated optional video ID;
arbitrary return URLs are never accepted.

The private bot chat displays a matching six-digit comparison code and a
confirmation/cancel button. Code comparison is a phishing defense, not the
cryptographic credential. The existing secret-header webhook verifies Telegram
updates. The callback sender must match the original private-chat sender and
the challenge's candidate Telegram ID. Browser-supplied IDs/names cannot log in.
Completion requires the initiating browser cookie, approved unexpired challenge
and a same-origin POST. Completion is consumed atomically and cannot be replayed.

One Telegram ID has one immutable account link. Existing links open the same
account. For an unlinked identity the person explicitly chooses either a new
account without email/password, or existing email sign-in followed by explicit
link confirmation. Names are never used to merge accounts. A Telegram ID already
attached elsewhere cannot be reassigned. Closing the dialog cancels its challenge.

Sessions use the existing __Host-mysterion_viewer cookie, session table, idle/
absolute expiry, credential-version validation and login history. Disabled
accounts cannot log in; new login still replaces that account's previous session.

## Account schema compatibility

Migration 0014 only adds telegram_only=0 to existing accounts and a challenge
table/index. No account table rebuild or historical data conversion occurs.
The legacy email column is NOT NULL. New Telegram-only rows therefore use a
random non-deliverable internal key under identity.invalid. It is not a user's
email and is hidden from the participant profile (email=null/emailVerified=false).
No fake email verification timestamp is stored. Email login/recovery do not
accept these rows, and their password-reset control is hidden. Authorization
requires an active account plus the confirmed immutable Telegram identity link.
Existing email registration/recovery/verification behavior is preserved.

## Purchase continuity

The purchase dialog offers Telegram first and email second. After email sign-in
or bot completion, only the server-validated selected video is restored. A
private Digital offer verifies the linked buyer, mapping, price/currency, video
readiness and admin blocks, then rechecks official product metadata. Only the
owner-selected test participant in test mode (or separately enabled future live
mode) can receive the approved Tribute product URL. With issuance/sales off,
authentication works and payment remains unavailable. Existing public buy
buttons stay hidden until actual payment readiness; auth can be tested from the
account page without enabling public sales.

Read-only Digital Products metadata uses Workers-compatible manual redirects;
redirect responses are refused. This does not modify the Shop API transport or
its financial order processing. Receipt issuance still matches the signed
Tribute telegram_user_id to the confirmed server-side link. Paying through a
different Telegram never grants the selected account access. Email-only Tribute
buyers remain queued for manual review. Refunds and purchase uniqueness are
unchanged.

## Owner test steps

1. The first valid login /start automatically checks the existing webhook and
   adds callback_query alongside message if needed. This happens only after the
   secret header and live challenge are verified; another URL is never replaced.
   URL/derived secret stay the same, pending updates are not dropped. The owner
   setup button remains available for an explicit recheck.
2. In a private browser window open /viewer-account.html → Continue with
   Telegram → open the bot → Start → compare code → Confirm sign-in → return to
   the original browser. For a new ID choose Create account; for an old email
   account choose email and confirm linking in that authenticated browser.
3. Verify profile/library, repeat sign-in, logout and rejection from another
   browser. No email is required for the Telegram-only account.
4. Before payment configure the 100 RUB product/video/duration and select the
   one test participant. Do not enable public/live flags. A controlled purchase
   must use that SAME Telegram and RUB; confirm one order/access and refund.

Official Telegram contract: https://core.telegram.org/bots/api#callbackquery and
https://core.telegram.org/bots/api#setwebhook. All automated tests use local keys,
bot fixtures and local SQLite/D1, never real Telegram purchases or production users.

Public Digital purchase buttons additionally require the explicit live flag, live mode, per-video sale_enabled and verified official product metadata. They do not depend on enabling Shop payments. Existing Shop-ready offers return to the existing catalog checkout. None of these live flags is enabled by this release.
