# Completed Bunny uploads and conference lessons

Recovered existing D1 video 22491572-6b94-4f49-b80d-c07574ae4044, bound to
Bunny library 803179 / video 108959f3-b1ee-48a1-9148-2b8dd6b7efae.
The video was already published and its last provider sync showed status 4 / 100%.
Existing lesson 0f09762c-2b4b-44cc-b9c7-21bbe077f72e was still a draft;
only that lesson's state/revision were changed after a local backup, with an audit
entry. No new video or lesson was created. The video remains paid, with standalone
sales disabled and public_preview=0. Course price/policy remain 10000 RUB / 60 days.

When HEAD returns 404/410, the uploader first calls its authorized server status
callback. Only provider-confirmed Ready completes the upload. An unavailable or
not-ready provider never counts as successful. This path performs no TUS POST or
PATCH and offers no restart if the provider reports Ready. The original bounded
confirmed-offset recovery and explicit restart confirmation remain in place.

The lesson editor refreshes its video selector on opening and provides an explicit
refresh button, preserving the selected video ID. Ready items are labelled.
The selection includes drafts as before; server publication checks remain intact.
Ready draft uploads intentionally stay drafts until the existing publish workflow.

Owner-only read-only Bunny diagnostics now support published videos and report the
bound provider ID, library, duration and Ready state. Ready objects do not require a
live TUS session; expired/completed session URLs are not evidence of missing video.

Backups and operator recovery reports stay under local output/ready-video-recovery
and are excluded from the release. No migrations, payments, grants or secrets change.
