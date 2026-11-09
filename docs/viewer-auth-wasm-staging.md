# Viewer auth: WASM and Free-plan validation

Branch: `viewer-auth`. Target: `mysterion-viewer-staging` only.

## Implementation

Pinned `hash-wasm` 4.13.0 is vendored with its MIT license, original package
SHA-512 and generated-file SHA-256 hashes. `tools/vendor-hash-wasm.mjs` verifies
the package before extraction. Runtime does not use npm, a CDN, network imports,
eval, runtime WASM compilation or a fallback password algorithm.

Argon2id remains v19, m=19456 KiB, t=2, p=1, dkLen=32, salt=16 bytes and the
existing `argon2id:v19:m19456:t2:p1:<salt hex>:<hash hex>` encoding. Both WASM
modules are static imports. Each operation has independent instances, caches and
mutexes; no pending Promise or queue is shared across requests. Instance memories
and the password byte buffer are wiped after completion or a caught failure.
Hard runtime termination cannot be caught in JavaScript.

The library is asynchronous during setup and finalization. Several concurrent
requests can allocate several ~19 MiB working areas. The isolate's 128 MB budget
includes JS and WASM. Four concurrent HTTP requests pass locally; this is not a
proof of safe unbounded concurrency. Existing D1 rate limits remain enabled.

The 20-second client deadline and 8–128 code point password policy remain.
Email verification is an explicit same-origin POST with the original random
256-bit single-use token. Format, SHA-256 lookup, purpose, expiration, consumed
state, credential version and account status are checked. Consumption and account
activation use the existing atomic D1 batch. GET does not activate an account,
and confirmation does not create a session. The password is required only on
login or password reset, not on email confirmation. No schema migration is needed.

## Local checks

Node tests that import the server password module need the Node-only WASM hook:

```text
node --import ./tools/register-viewer-wasm.mjs tools/test-viewer-auth.mjs
node --import ./tools/register-viewer-wasm.mjs tools/test-viewer-wasm.mjs
node --import ./tools/register-viewer-wasm.mjs tools/check-viewer-browser.mjs
node --import ./tools/register-viewer-wasm.mjs tools/benchmark-viewer-kdf.mjs
node tools/test-viewer-client.mjs
node tools/test-viewer-runtime.mjs
node tools/test-viewer-d1-runtime.mjs
node tools/test-viewer-pages-build.mjs
```

Use the project's local Node 24 binary if Node on PATH is older. Runtime/build
tests use the existing ignored Wrangler tooling in `output/audit-tools/`.
The full Pages build test checks both emitted WASM files and executes the actual
bundled `/api/viewer/login` handler against an ephemeral local D1 database.

## Safe staging publication

Both connected Pages projects currently build preview branches automatically.
To avoid starting a preview in the original project, use a commit message prefixed
`[CF-Pages-Skip]`, push **only** `origin viewer-auth`, then explicitly upload the
tested package to **mysterion-viewer-staging**. Do not change the original project's
branch controls. `tools/package-viewer-staging.mjs` copies allowlisted public
assets plus the compiled `_worker.js` directory; it excludes local configuration,
diagnostic helpers, credentials, source tools and Git metadata.

Keep `wrangler.viewer-staging-d1.jsonc` untracked and unchanged. Do not use its
binding for deployment. The staging project's existing binding and secrets stay
in Cloudflare. D1 migrations, paid features, Bunny and Admin Only are unchanged.

## CPU measurement on Workers Free

CPU is measured by Cloudflare, not by browser timing, Date.now or server logs.
Local workerd/Miniflare tests do not enforce the cloud Free-plan CPU quota.

1. Confirm the staging project is still on Free; do not upgrade any plan.
2. Open staging Functions real-time logs and Metrics. Use the deployed commit and
   timestamp to identify the run. Record invocation CPU time and outcome, including
   `exceededCpu`, memory failures and cold/warm behavior. If the available log/API
   does not expose CPU, report it as unavailable; do not infer it from wall time.
3. Preview the bounded check with `node tools/probe-viewer-free-staging.mjs`.
4. Run it explicitly with `node tools/probe-viewer-free-staging.mjs --run-staging`.
   The origin is hardcoded to staging. At most five sequential login requests use
   a random, reserved `.invalid` identity. No accounts, emails, sessions, videos or
   entitlements are created. Only staging rate-limit buckets change. Unknown-user
   login runs the full fixed-parameter Argon2id dummy verification.
5. Compare request timestamps/IDs with platform metrics. Stop on an unexpected
   response; do not automatically retry. Do not send actual passwords, cookies,
   email tokens, secrets or complete request objects to logs.
6. A few 401 responses do not prove Free compliance: Cloudflare can tolerate
   occasional CPU overruns. Require a margin below 10 ms across cold/warm samples
   and representative traffic before declaring Free suitable. Further load testing
   must be bounded and separately planned to avoid exhausting shared quotas.

Local WASM measurements remain around tens of milliseconds per hash. Therefore
the current security parameters may still exceed Free's 10 ms CPU limit. If cloud
measurements confirm that, report Free as unsuitable for password hashing in this
configuration; do not reduce memory/passes, cache password checks, skip unknown-user
verification, switch to a weak hash, split a hash across requests or enable Paid.

Real Resend delivery, Russian ISP reachability and actual iPhone Safari require
separate real-world tests. This stage does not claim they were validated.
