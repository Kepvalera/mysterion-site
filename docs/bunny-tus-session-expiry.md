# Bunny TUS session expiry

The 1816ff3 server signed upload credentials for 900 seconds. Bunny documents that
an incomplete TUS resource expires at its original AuthorizationExpire, and fresh
signatures do not extend that resource lifetime. This explains an active PATCH
returning 404 after roughly fifteen minutes, independently of chunk size.

Official reference: https://bunny.net/docs/stream/tus-resumable-uploads

Upload grants now last 24 hours (the documented example). This is scoped to the
existing video GUID, behind existing staff authorization. Playback TTL is unchanged.
PATCH 404/410 triggers a read-only HEAD with fresh credentials. If HEAD succeeds,
continue only at its validated offset. If HEAD is missing, stop and preserve progress.
Only a subsequent explicit confirmation may create one new TUS session for the same
video. Previously transferred bytes in an expired resource cannot be recovered by
re-signing. No new Bunny video object is needed.

In /admin-media, open the existing draft and use "Check Bunny session (read only)".
The owner-only endpoint GET /api/platform/admin/videos/:id/upload-diagnostics checks
the bound Bunny video with GET and its saved TUS URL with HEAD. It returns no keys,
signatures, raw upload URL or upstream body. It performs no database writes.
`resume_existing_session` means the confirmed_bytes offset can be used;
`session_missing_new_session_requires_confirmation` means the video exists but the
upload resource is gone. Copy only this safe report, not Network headers or HAR.

Web Locks prevents simultaneous transfers to the same video from tabs of the same
browser profile where supported. This does not lock other browsers; do not upload
the same video simultaneously from multiple devices. Distinct video IDs are isolated.

No real provider uploads/objects are created by regression tests. A successful local
transfer does not prove the user's real network can complete a 1.5 GB Bunny transfer.
