# Olamide messenger workflows

This release extends the Olamide application with a WhatsApp-style interface;
it does not connect to the WhatsApp network or claim complete WhatsApp parity.

## Implemented backend workflows

- New group: choose a name and up to 49 existing workspace contacts. Members
  can read and send group messages and files. Owners rename, add/remove members,
  transfer ownership or close the group; other members can leave. Removed members
  lose access to group history and its files. Members can read retained history
  from before joining. Senders can edit/remove their own group messages.
- New community: an owner-only announcement room, with the same membership
  management. This is not WhatsApp's subgroup/community architecture.
- Broadcast: send an atomic individual text message to 1–20 active contacts.
  The recipient list is not shared. Blocked recipients stop the entire request.
- Star/unstar personal messages and open their original chats. Forward a message
  or attachment to another active workspace contact. Pin, mute, archive, block,
  mark unread and filter chats by pinned/unread state using stored preferences.
- Attach images, audio, short video or PDF documents to direct/group messages.
  Files are authenticated, tenant scoped and signature checked: PNG, JPEG, GIF,
  WebP, WebM, Ogg, MP4 and PDF. The limit is 2 MB per file and 20 MB per account.
  PDFs download; images/audio/video render with browser controls. Storage & data
  lists owned uploads and deletes files, making shared references unavailable.
- Browser voice recording uses microphone permission. Tap to start/stop;
  on touch, hold to record, slide left to cancel, or slide up to lock recording.
  Recordings stop at 60 seconds or the size limit. Upload/recording completes
  before Send. A canceled or unshared upload may remain under Storage & data.
- Updates: post text and optional media with a 24-hour feed expiry. Audience is
  mutual contacts or only yourself. Owners can remove updates. Expired records
  are excluded from reads, not cryptographically erased from backups/storage.
- Linked sessions: list your authenticated app sessions and end selected ones.
  The existing latest-login default and super-admin session limits still apply.
- Settings, privacy, appearance and help shortcuts open existing app screens.
  Audio SIP and video meetings keep the existing media engines and invitation
  workflow; minimized overlays remain visible across app navigation.

Messages/files are stored on the application server without end-to-end encryption.
Group polls, stickers, live location, view-once media, message backups, native
contact/device QR pairing, WhatsApp channels/community subgroups, direct SIP video
ringing, native background call delivery and WhatsApp-scale conferencing are not
implemented by this release. Browser voice gestures and calls need device testing;
network availability, permissions, TURN and commissioned SIP remain requirements.

## Deployment

After the exact commit passes GitHub deployment CI, run on the existing server:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-messenger-features.sh
```

The Ansible workflow checks the current commit's CI approval, backs up MySQL,
builds API/web images, migrates additive tables and checks public HTTPS health.
The messaging-GUI-only installer is insufficient for these new backend tables.
Refresh open browsers after deployment. API restarts close live meeting signaling.

## Acceptance

Use two accounts in the same tenant and another in a different tenant. Check
messages, attachments, forwarding, stars, pinned/unread filters, group creation,
member messages, owner controls, member removal, owner-only announcements,
broadcast delivery, private/mutual-contact status visibility, and session ending.
A file must be unavailable to an unrelated account and become unavailable after
its owner deletes it. Test recording permission denial, cancel/lock gestures,
file limits, voice playback and minimized calling overlays on actual phones.
