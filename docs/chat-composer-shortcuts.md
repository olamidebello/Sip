# Chat composer shortcuts

The direct-message composer shows icons for emoji (interpreting the requested “MOG” from the supplied reference), file attachment, video invitation, sending money, voice recording, and message submission. File input and text button labels are hidden visually; actions retain accessible names and tooltips. Uploaded filename and recording status remain available above the composer, with an icon to remove a pending attachment. No new API or database schema is required.

- Attachment opens the existing browser file chooser and uploads to the authenticated attachment API.
- Voice preserves tap recording and touch hold, slide-left cancel, slide-up lock. While recording, the mic becomes a stop icon.
- Emoji opens the existing picker and inserts into the current draft.
- Video opens the existing video invitation workflow when meeting access is enabled.
- Money is enabled only with a selected email contact and existing Money navigation/service availability. It preselects that recipient, opens amount entry, and requires Pay and Confirm payment through the existing wallet backend. Clicking the shortcut never transfers funds.
- Send and Save edit remain icons with distinct accessible labels.

Deploy after exact-commit validation succeeds:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-messaging-gui.sh
```

Reload the browser afterwards. This change is web-only and preserves the repaired SIP provisioning configuration.
