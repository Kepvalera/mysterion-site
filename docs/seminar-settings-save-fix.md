# Seminar settings save correction

Base: Production `c671689c7ef0c3abc033fdaffb3c79606a8e20f5`. The published seminar-card design is retained.
The correction is local and must not be deployed without separate owner approval.

## Reproduced cause

The owner reported clearing the IANA timezone field. The old date converter passed its value directly to `Intl.DateTimeFormat`. An empty or invalid zone throws a native `RangeError`. A whitespace-only field passes HTML `required` validation, reaches that converter and reproduces the exact message `request_failed`. Chrome reproduction observed **zero PUT requests**. A truly empty field normally triggers native HTML validation, but the old converter also lacked a controlled error for that input.

The old UI discarded the native exception message and showed the generic code. This is a client-side failure before the save API in the reproduced case.

Read-only Production checks confirmed the current deployed JavaScript, migration 0024, all four event tables and admin access protection. A brief live Functions log observation did not capture any event-save PUT; historical logs for the user's earlier attempt were unavailable. No claim is made that this short observation reconstructs that earlier request.

## Changes

- Trim and validate the timezone before converting dates, with RU/EN guidance and no guessed timezone. Missing and invalid values get distinct messages.
- Match duration/capacity/opening-time checks to server limits. Native required-field failures also update the form's notice.
- Distinguish network, timeout, session, owner-role, server and photo-upload failures without exposing native exception text or submitted values.
- Server timezone validation consistently returns `invalid_event_timezone` for missing/blank/invalid input.
- Successful settings saves return their new revision. A failed photo upload no longer leaves the same open form using a stale settings revision. The notice explicitly states that settings were saved but the photo was not uploaded.
- Version the changed admin script to avoid a stale browser asset after an approved deployment.

No migration, new authorization mechanism, payment/access change or Production-data write is needed.

## Verification

Chrome tests cover empty/whitespace/invalid zones with no PUT, valid trimmed zones, creation, editing, repeated saves, secret preservation, failed-photo retry, network/auth/server messages, RU/EN and 375/1366 px. API tests cover owner/revision guards and direct invalid timezone submissions. Existing seminar, capacity, payment, refund and access regressions also run with network-disabled local fixtures.

Zoom URLs/passwords remain write-only in the admin form, absent from public program responses, action history and error messages. Production is left on the original commit pending approval.
