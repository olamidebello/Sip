# Messaging and call overlays

Run on the existing SIP server as root:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-messaging-gui.sh
```

This isolated local Ansible playbook deploys the latest main-branch release that
passed the existing deployment CI. Wait for GitHub checks before running. The
existing updater backs up MySQL before version changes and validates API health.
The playbook then checks that the GUI patch exists, builds the web container, and
checks public HTTPS and API availability. Existing Docker, Ansible, secrets and a
commissioned application are prerequisites. Tracked local edits block updates;
do not force reset them. An older validated release can cause a non-forward
update rejection; retry once this release passes CI.

The Olamide-branded WhatsApp-style interface includes chat search, avatars,
bubbles, mobile back navigation, conversation expansion, emoji insertion,
Chats/Archived visibility shortcuts and existing reply/forward/mute/block controls.
Archived uses the existing checkbox to include archived conversations.
Audio call overlays reuse the existing SIP answer, reject, mute, hold, hangup
and DTMF handlers, show call identity supplied by the client, and display a
connected-call timer. Caller identity may remain Unknown caller.
Video overlays use the existing signed-in meeting service with microphone,
camera, screen share, leave and host controls. Minimize/expand preserves media.
The chat video button opens the meeting invitation workflow; create a room and
share its invite with the contact. It does not ring a contact as a SIP video call.

Browser microphone/camera permission, provisioned SIP accounts and working
SIP transport are required. Video meetings need meeting permissions and working
ICE/TURN for the participants' networks. No WhatsApp network integration,
WhatsApp encryption, media attachments or voice notes are added by this GUI.

Acceptance: sign into two tenant accounts and send/reply/search a message;
insert an emoji at the cursor; expand/restore a conversation; archive/unarchive;
receive and answer a SIP call, then mute, hold/resume and hang up; create/join a
video meeting and minimize/expand while verifying audio/video on both devices.
HTTP health checks alone do not establish delivery, registration or media quality.

Long press or right-click a chat to open its conversation controls. Long press
a message to highlight it and focus its existing actions. Swipe a message right
to reply; swipe the conversation header right on mobile to return to chats.
Movement and scroll cancel long presses. Visible controls remain available;
no destructive action is executed solely by a swipe. Escape clears selection.
These are implemented gestures, not every WhatsApp gesture or feature.
