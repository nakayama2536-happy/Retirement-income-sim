# Retirement planning comment: stage 2 integration verification

User authorized a development branch, PR and CI for the cloud UI candidate and retirement comment. Production merge/deployment, Firebase settings and personal-data changes are NOT authorized.

This verification-only draft PR stages the existing comment candidate in a disposable runner checkout based on public main a77a50fa07152a93e3057a5c4a719b16531b9111. Only the runner working copy of detail-settings.mjs and detail-ui.mjs is changed, and retirement-comment.mjs is added there. The commit itself does not alter runtime files. Do not merge this draft as a feature release.

Reason: local source checkout/download failed, but connector repository operations are available. The exact baseline blobs are checked before transforming. Evidence retains source hashes, Node results, actual Chromium UI results at 390/1280 pixels and a reproducible staged archive. Tests use the existing fictional fixture and loopback HTTP only; no Firebase credentials or live Firebase calls are used.

The optional multiline comment uses config.retirement.conceptComment; 2,000 UTF-16 units, blank accepted, no calculation interpretation. Input and preview do not save; explicit application uses existing persistence and undo. Unknown fields and scenarios must be retained. Oversized input is rejected rather than truncated. HTML-like text must not execute.

Stage 2 verifies complete existing modules for saving, reload, cancellation, undo, failed writes, stale proposals, backup/restore and unchanged financial results. It does not certify iPhone autofill, real-user data, cloud service behavior, tax rules, or the separate cloud-login UI candidate.

Stage 3 must commit the verified runtime edits alongside the separate approved cloud-login/UI candidate, prepare a unique release identity, Service Worker and distribution manifest, and run affected validation. The staged source archive is NOT a deployable release. No approval for main merge or production deployment is implied.
