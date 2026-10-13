# Messaging privacy rollout

## Implemented stage 1: direct messages

Run after exact-head deployment CI passes:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-message-privacy.sh
```

The Ansible wrapper checks complete source, runs the existing CI-gated MySQL backup/build/migration/restart workflow and verifies public health plus the deployed chat bundle. It creates additive message expiry/view-once/opened columns, an attachment restriction column, and indexes. It does not alter SIP credentials. Reload the browser after deployment.

In the conversation menu, choose Off, 24 hours, 7 days or 90 days for a newly sent direct message. Existing history is unaffected. This is a per-message timer, not a shared whole-conversation setting. The API immediately excludes expired messages, reactions, quoted originals and starred/forwardable source records. Attachment URL access also checks expiry. A bounded worker clears expired message bodies every minute and deletes expired/consumed attachment bytes when no live shared reference remains. Server backups and previously saved or forwarded copies are not erased.

After uploading a fresh image/audio/video, the composer offers a `①` view-once control. The sender cannot reopen it. The recipient explicitly opens it through a POST endpoint; a transaction locks and consumes the unopened message before releasing bytes. Normal attachment URLs are blocked for restricted media, including the uploader's URL. Simultaneous opens can yield at most one successful server response. Media is rendered from a temporary blob URL and revoked when its dialog closes or the user signs out. Network failure after consumption does not allow another open. PDF files are not view-once media. The view-once flag applies to attached media; accompanying text and metadata are not hidden. These browser controls cannot prevent screenshots, recording, OS caching or a modified recipient client saving received bytes.

Stage 1 applies to direct chats, not group messages. No end-to-end encryption is provided: operators with database/backups can still read stored plaintext. The capability endpoint explicitly reports E2E and native backup/sync as unavailable.

## Remaining stages

Stage 2 needs a maintained cryptographic protocol implementation, independent device identities, verified recipient/device keys, encrypted media, rotation/revocation, key-change warnings, secure local key storage, and migration rules separating legacy plaintext from newly encrypted messages. It must not be implemented as a server-held encryption key or an unreviewed homemade protocol.

Stage 3 depends on that device-key architecture: authenticated device enrollment/revocation, encrypted history and key backup, user-held recovery material, restoration and conflict handling, offline encrypted synchronization and Android/iOS storage integration. Ansible deploys implemented services and schemas; it cannot substitute for these client/protocol implementations.

Acceptance: two users, correct and incorrect tenants, simultaneous open requests, expired reads/replies/stars/forwards/downloads, PDF rejection, logout cleanup, and the absence of raw media URLs on once messages. The CI MySQL integration suite includes expiry and concurrent at-most-once release checks. Real-device acceptance remains required.
