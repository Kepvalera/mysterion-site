# Participant dashboard — local implementation

The functional extension is documented in [viewer-platform-local.md](viewer-platform-local.md).
The original interface-only behavior below remains the fallback when
`VIEWER_PLATFORM_ENABLED` is not enabled. No remote settings were changed.

Scope: branch `viewer-auth` only. No commit, push, deployment, remote D1 writes,
migrations, paid services, Access configuration or secret changes in this task.

## Working locally

`viewer-account.html` retains the existing sign-in, registration, verification and
reset forms. After successful viewer sign-in the same URL shows the participant
dashboard. Direct links to `#home`, `#courses`, `#videos`, `#purchases` and `#profile`
are UI navigation only and do not grant access. A successful fresh sign-in opens
Home. A signed-out visitor sees the sign-in form, never account data.

The dashboard uses existing self-hosted fonts, a dark navy palette, restrained
gold accents and inline line SVG icons. No new people, photos, libraries, canvas,
third-party fonts, network integrations or large media assets are introduced.
Animations use opacity/transform and honor prefers-reduced-motion.

The existing HttpOnly viewer cookie authenticates the new read-only endpoint
`GET /api/viewer/account`. It validates the current active, verified account,
session token, credential version, idle timeout and absolute expiry on the server.
The profile query rechecks the current token, so a session replaced during lookup
cannot return the old account snapshot. Responses are no-store, and include only:

- email, email verification state, account locale and real registration timestamp;
- session expiration timestamp, never the session token;
- explicit empty course/video/purchase/continuation arrays;
- false feature flags for unconnected material access, purchases and display name.

Anonymous, forged, expired, disabled or superseded sessions receive 401. URL
parameters and claimed roles do not select a user. The endpoint does not query
legacy Access users, purchases, entitlements or grants, and does not reveal hashes,
credential versions, internal account IDs, access_sub or cookies.

The participant's name is absent from the current D1 schema. The profile displays
“Not provided” and offers no fictitious save operation. Adding editable names is
a future additive schema/API change, not a browser-storage workaround.

Password change uses the existing forgot-password email flow from the profile.
Existing rate limits, CSRF checks, email tokens, Argon2id and reset behavior are
preserved. This sends an email; it does not change the password immediately.
Logout and end-all-sessions still use the original server handlers. A small shared
header event clears UI state after an intentional viewer logout, so it is not
misreported as unexpected session expiration. Access administrator sessions and
server permissions are unchanged.

Private profile data lives only in a JS closure and DOM. It is cleared on logout,
session loss, an unauthorized response and before loading a replacement account.
No passwords, tokens, profile or material records are written to localStorage,
sessionStorage or IndexedDB. Existing nonsecret sign-in flags remain unchanged.

## Deliberate empty states

The new viewer accounts are separate from legacy `users.access_sub`. No automatic
email match, entitlement import or fabricated purchase is performed. Course/video
access, purchase history and saved learning progress are not yet connected to this
identity model. The present API fails closed and returns empty arrays. There are
no payment buttons, private video URLs or placeholder watch buttons.

Public media and school navigation point to the existing `/media.html` and
`/online-school.html`. Their infrastructure is unchanged. This task does not claim
that staging's public media binding has been configured or paid playback enabled.

## Future roles — design only, not implemented

| Planned role | Intended responsibilities after separate approval |
| --- | --- |
| Main administrator | Manage staff and viewer access; publish and revoke materials |
| Publishing staff | Upload, edit and publish within an approved scope |
| Draft-upload staff | Upload and edit drafts; cannot publish or grant access |
| Participant | Read only materials granted by the server |

These labels do not alter the current role enum, Access policies or administrator
APIs. Future viewer entitlements must reference a verified viewer account ID and
be checked server-side for publication, revocation and expiry on both listing and
playback. Collection membership and dynamic access to new lessons require explicit
schema/API work. Browser tab selection or a client role flag must never authorize
playback. Paid playback remains disabled until its separate security stage passes.

## Validation and screenshots

```text
node --import ./tools/register-viewer-wasm.mjs tools/test-viewer-account.mjs
node --import ./tools/register-viewer-wasm.mjs tools/check-viewer-browser.mjs
node --import ./tools/register-viewer-wasm.mjs tools/test-viewer-auth.mjs
node --import ./tools/register-viewer-wasm.mjs tools/test-viewer-rate-limit.mjs
node tools/test-viewer-client.mjs
node tools/test-viewer-d1-runtime.mjs
node tools/test-viewer-pages-build.mjs
```

The browser test runs actual local handlers with in-memory SQLite and a local
email capture. `browser@example.invalid` in screenshots is a synthetic local test
account, not a published participant. No purchase/course/material fixtures are
shown. Screenshots are in ignored `output/viewer-dashboard-check/`, with Home RU/EN
at 390 and 1440 px and Profile/Purchases RU at both sizes. Browser coverage includes
320, 375, 390, 430, 768 and 1440 px, all five sections, keyboard focus, reduced
motion, password reset email request, session replacement, signed-out access and
logout. Chrome is used; this is not an actual iPhone Safari test.

Recorded local results: 119 browser checks with no captured JavaScript/CSP errors;
20 account API/security checks; 87 existing authentication checks; 32 rate-limit
checks; 20 timeout/RU/EN client checks. Local workerd/D1 returned the authenticated
profile correctly, and the complete Pages Functions build passed. Credential
pattern scanning and `git diff --check` passed. Real email delivery was not tested.

Files changed or added in this task:

- `viewer-account.html`, `viewer-account.css`, `viewer-account.js`: existing page,
  dark design, form/account switching and session lifecycle.
- `viewer-dashboard.js`: five participant views, translations, profile loading,
  reset-email request and private DOM cleanup.
- `account.js`: UI-only intentional-signout handling in the shared header.
- `media-worker/src/viewer-auth.mjs`: authenticated, read-only account endpoint.
- `tools/test-viewer-account.mjs`, `tools/check-viewer-browser.mjs`,
  `tools/test-viewer-client.mjs`, `tools/test-viewer-d1-runtime.mjs`: validation.
- `docs/viewer-dashboard-local.md`: scope, limitations and future role model.

Cloudflare CPU limits are not changed. Account reads do not use Argon2id, but the
previously measured password-authentication CPU limitation on Workers Free remains.
