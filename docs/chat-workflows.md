# Reference-style chat workflows

The direct-chat screen follows the supplied dark mobile reference with a contact name/avatar header, typing state, compact sent/received bubbles, date separators, time stamps, real read indicators, quoted replies, and icon-only composition. Contact imports and conversation preferences appear inside the header menu. The avatar is a generated initials fallback, not a fabricated contact photo. Clicking a quoted reply scrolls to the original when it is in the loaded history.

Hold a message to reveal available actions; keyboard Enter/Shift+F10 and desktop right-click are also supported. Swipe horizontally to reply to that exact message. Vertical scrolling cancels a pending gesture. The actions are:

| Action | Operation |
| --- | --- |
| Reply | Sets the original message ID in `/api/messages` submission |
| Copy | Secure-context clipboard; selectable text fallback when browser permission is unavailable |
| Info | Shows the message's existing creation, read and edit timestamps |
| Star/Unstar | Saved message preference through `/api/messenger/messages/:id/star` |
| Forward | Selected contact through `/api/messenger/messages/:id/forward` |
| React/remove reaction | Existing authenticated message mutation |
| Edit | Sender's own message through PATCH |
| Remove | Sender's own message through DELETE |

Send shows one gray check after server persistence. Read shows two blue checks only when the backend supplies `read_at`. There is no invented device-delivered state. Reply previews quote the stored original body. Removed messages expose no mutation menu.

Existing workflows remain connected: file upload/download and playback, voice notes with cancellation/locking, message search, pin, unread, archive, mute, block, SIP audio call, video invitation, and confirmed internal wallet transfer to the selected contact. Money and video continue to respect existing account availability and service permissions. Video uses Olamide's meeting invitations, not WhatsApp's private calling service.

This release is not every WhatsApp feature. Messages remain stored on the server and are not end-to-end encrypted. Device linking uses Olamide browser sessions. View-once media, disappearing messages, native WhatsApp synchronization/backups, full WhatsApp sticker/GIF catalog, photo avatars and encrypted key management are not implemented by these layout changes.

After exact-commit deployment CI passes:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-chat-experience.sh
```

Reload the browser; test two-user text/media, long press, distinct swipe replies, quoted-message navigation, copy fallback, sender-only editing/deletion, reactions, search/preferences and real read indicators. The chat presentation changes require no new schema. The full Ansible installer validates the exact CI-approved release, verifies implemented source files, backs up MySQL, builds API/web, reruns additive migrations, restarts the services and verifies HTTPS and the deployed chat bundle. It preserves existing SIP credentials. The installer creates/builds deployment artifacts for implemented source; it does not generate missing application functionality or claim unsupported capabilities.
