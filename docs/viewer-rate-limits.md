# Viewer authentication rate limits

Applies only to the viewer email/password API. Cloudflare Access and the existing
administrative APIs are unchanged. No D1 schema migration or secret rotation is
required. Policies use new operation-scoped HMAC keys in `viewer_rate_limits`.
Existing counter rows are not reset or deleted; normal bounded expiry cleanup
continues. All intervals are fixed UTC-epoch-aligned windows.

## Admission limits

| Operation | Per IP | Per email or token |
| --- | --- | --- |
| Login | 30 / 10 minutes | 30 / 10 minutes per email |
| Registration | 5 / hour | 3 / hour per email |
| Request password recovery | 10 / 15 minutes | 3 / 15 minutes per email |
| Request verification email again | 10 / 15 minutes | 3 / 15 minutes per email |
| Confirm email token | 30 / 10 minutes | 5 / 15 minutes per token |
| Submit reset token and new password | 10 / 15 minutes | 5 / 15 minutes per token |
| Combined mail intents: registration, recovery, resend | 20 / hour | 5 / hour per email |
| Combined Argon2id admission: registration, login, password reset | 30 / 10 minutes | — |

These are resource/abuse limits, not counts of incorrect passwords. Successful
operations and attempts that later encounter a server error can consume admission
quota. This prevents CPU or mail-provider outages from allowing unlimited retries.
Mail intent limits apply equally to existing and unknown email addresses before
account lookup; rate responses do not disclose whether an account exists. Invalid
token formats consume the operation's IP quota, but do not share a global token
bucket. Session checks, logout and logout-all do not consume these quotas.

Each operation charges its IP rule once. Argon2id and mail have separate, explicit
shared resource rules. Confirmation does not charge the same IP counter twice and
does not consume Argon2id quota. Exhausting mail/recovery quotas does not consume
login/password-failure quotas.

## Incorrect passwords and concurrent attempts

Actual wrong passwords are limited to 5 / 15 minutes for an email+IP pair and
10 / 15 minutes for an email across IPs. Correct passwords do not add failures,
including the case where an account is disabled or unverified. Server errors do
not add password failures. Existing failures are not erased by successful login.
Unknown accounts use the same dummy-hash work and wrong-password policy.

Before password verification, atomic SQLite statements reserve capacity in both
failure limits. Committed failures plus unexpired reservations must fit within
the policy. This prevents simultaneous requests from bypassing the failure limit.
Only a completed invalid-password check converts its reservation into a failure;
success or a caught server error deletes its reservation. Conversion and cleanup
use a D1 batch. Reservations expire after at most 30 seconds, or at the window
boundary, so cancellation/crash cannot leave an indefinite lock. No request waits
on another request's Promise. A transient 429 may represent occupied reservations,
with a retry time up to 30 seconds rather than the full failure window.

Database/transport failures with an unknown commit outcome remain a distributed
systems limitation. A failed cleanup may leave only a short reservation, not an
indefinite lock. No global failure-counter reset is used as a workaround.

## Response and privacy

429 responses include `Retry-After` seconds and JSON `retryAfter`, `limitScope`
and `requestId`. Fixed scope labels distinguish policies without exposing raw
IP/email/token values or their HMACs. Rejected increments saturate at the limit
and do not extend the window. The client renders a RU/EN duration in minutes and
seconds; there is no automatic retry. The time belongs to the blocking rule;
another applicable rule or new traffic can still prevent a later attempt.

The client IP comes only from validated, normalized `CF-Connecting-IP`.
`X-Forwarded-For` and request body values cannot override it. Missing/invalid IP
on a public origin returns 503 `client_ip_unavailable` before any counter write.
For local development only, `VIEWER_LOCAL_IP_FALLBACK=true` permits loopback on
an actual localhost/loopback URL matching the configured canonical origin. It
cannot activate on a public hostname. This variable is optional; no cloud setting
needs changing.

## Validation and remaining limits

Run with Node 24 and the existing local Wrangler dependencies:

```text
node --import ./tools/register-viewer-wasm.mjs tools/test-viewer-rate-limit.mjs
node tools/test-viewer-rate-runtime.mjs
node --import ./tools/register-viewer-wasm.mjs tools/test-viewer-auth.mjs
node tools/test-viewer-client.mjs
node tools/test-viewer-d1-runtime.mjs
node tools/test-viewer-pages-build.mjs
node --import ./tools/register-viewer-wasm.mjs tools/check-viewer-browser.mjs
```

The tests use in-memory SQLite or ephemeral local D1, never remote counters.
They cover repeated successful login/logout, actual failures, server failures at
lookup/hash/session persistence, concurrent reservation admission, expiry, missing
and malformed IP, token confirmation charging, independent operation limits,
combined mail/CPU limits, Retry-After and RU/EN presentation.

Users sharing a NAT/public IP still share IP resource limits; these conservative
starting values require monitoring before increasing. The rate-limit fix does
not make Argon2id fit the Workers Free 10 ms CPU budget. No cryptographic parameters,
account hashes, sessions schema, paid features or payment settings are weakened.
