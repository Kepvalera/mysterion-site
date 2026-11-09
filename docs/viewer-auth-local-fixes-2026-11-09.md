# Viewer authentication: local fixes, 2026-11-09

Scope: `viewer-auth` only. No deployment, remote migrations, account updates,
Cloudflare settings changes, media changes or paid playback enablement.

## CPU feasibility is a deployment gate

Argon2id remains version 19, m=19456 KiB, t=2, p=1, dkLen=32, with the same
salt and encoded-hash format. No existing password hashes need rewriting.

Before changes, a local Node measurement recorded 704 ms process CPU for one
hash. The original async implementation also ran successfully in local workerd:
six KDF operations took 4425 ms wall time. These are local measurements, **not**
Cloudflare invocation CPU measurements. Miniflare does not prove compliance with
the deployed plan's CPU quota. The account's actual plan/CPU limit has not been
verified with available read-only access.

After changes, three local Node hash samples measured 703, 735 and 859 ms CPU
(646, 730 and 873 ms wall time). Hardware, JIT and concurrent tests affect these
numbers; this is not a controlled performance comparison or a speedup claim.

Workers Free provides 10 ms CPU/request. This JS KDF cannot be treated as viable
within that budget. Workers Paid has a larger budget, but its actual configuration
and cloud measurements still need checking. Do not weaken Argon2id parameters,
enable a paid plan automatically, or publish this as a solution to CPU exhaustion.
Before deployment, confirm the budget and inspect cloud `cpuTime` and invocation
outcomes, especially `exceededCpu`, under representative concurrent load.

References:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/pages/functions/pricing/

## Request lifetime and memory

The old global Promise tail and jobs counter have been removed. Hashing uses the
same vendored Argon2id implementation's synchronous entry point, entirely within
the current request. No invocation waits on another invocation's Promise or
inherits a stranded queue slot after a failure/disconnection. A single isolate
executes one KDF at a time without overlapping its large working allocations.

This is still CPU-intensive, non-preemptive JS. Other requests on the same isolate
can experience CPU scheduling delay. The change does not provide parallel CPU,
cancel an executing KDF, guarantee low latency, or avoid Cloudflare hard limits.
Existing D1 rate limits remain in force. A vetted faster implementation or isolated
authentication compute may be a separate step if measured CPU/latency is unsuitable.

## Client and diagnostics

All viewer-account API requests have a 20-second deadline, covering both response
headers and JSON body. AbortController aborts network work; Promise.race also
releases the UI if a transport does not settle. Timers are cleared in finally.
Passwords are cleared as before. POSTs are not retried automatically. A timeout
means the server outcome is unknown: check email/session before retrying.

Registration and reset accept 8–128 Unicode code points, at most 512 UTF-8 bytes.
Login still checks existing hashes without imposing a new minimum. RU/EN copy
and registration/reset input hints use the new minimum.

Errors include a random request ID and response header X-Mysterion-Request-ID.
Logs contain only fixed operation/phase/error classifications, status and elapsed
**wall** time. They do not contain identity, email, passwords, cookies, tokens,
hashes, request URLs/bodies, provider bodies or arbitrary exception messages.
Cloudflare CPU termination can bypass JS catch/finally: platform telemetry is
required for those failures; application logs alone cannot exclude them.

## Local validation

- `tools/test-viewer-auth.mjs`: 77 checks; 8-character passwords, legacy async/sync
  hash agreement, RFC vector, errors followed by successful hashing, concurrent
  login/session and email-token races, CSRF, expiry, rate limits, unchanged legacy
  users, and redacted diagnostics.
- `tools/test-viewer-client.mjs`: 14 RU/EN checks; stuck fetch, stuck JSON body,
  deadline cleanup, retry, network failure and safe request-ID display.
- `tools/test-viewer-runtime.mjs`: local workerd; seven KDF operations and four
  separate concurrent HTTP requests with successful hash verification.
- `tools/test-viewer-d1-runtime.mjs`: local workerd/D1; registration, email
  confirmation and concurrent logins with exactly one valid session.
- `tools/check-viewer-browser.mjs`: 53 Chrome checks; widths 320, 375, 390, 430,
  768 and 1440; RU/EN, registration/verification/login and session replacement;
  no captured page/CSP errors. Screenshots in ignored `output/viewer-auth-check/`.
- Existing media security regression suite: 234 checks passed. No media code edits.
- Credential pattern scan: no findings. This is not a provider secret audit.

Email was captured locally; real Resend delivery and iPhone Safari were not tested.
No live staging registration was performed. A real CPU budget/load test and
email delivery check remain prerequisites for a separately authorized deployment.
