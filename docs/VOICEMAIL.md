# Private voicemail service

The standalone `deploy/ansible/voicemail-local.yml` installer targets the reviewed Debian 12 x86_64 deployment with Kamailio 5.6.3, RTPengine 10.5.3.5 and the local Docker API/web project. It preserves the installed source integrations and country-resource mount. It requires root and outbound HTTPS access to Debian, GitHub and the official Asterisk/PJProject sound/build download services. Source compilation can take several minutes.

## User controls

Account settings → **Voicemail**: enable/disable voicemail, set message length from 30 to 180 seconds, refresh provisioning status, and call **My voicemail (*98)**. The voice inbox supports listening, deleting messages and recording a personal greeting. This version does not expose recordings through public HTTP or a browser recording list. The phone keypad sends DTMF to navigate the inbox. The PIN is not required for the authenticated owner's *98 call.

## Super admin controls

Administrator → **Voicemail** button at the top of the page opens **Voicemail provisioning & control**. Select a user to change settings, refresh status, or provision missing mailboxes in the current tenant. Active users receive mailboxes automatically during synchronization. Settings writes use revision checks and security-event audit entries.

## Call handling

Only authorized recipient routes can fall back to voicemail. Existing DID ownership and location authorization run first. Offline DID recipients can leave a message immediately. Internal offline calls retain the existing device wake attempt before falling back. Ringing calls fall back on 408, 480 or 486; cancellation and explicit 603 rejection do not trigger voicemail. Normal ringing/wake timeout is 45 seconds; a late provisional SIP reply can extend Kamailio's default INVITE timer. Paid outbound carrier calls are not redirected into voicemail.

Mailbox lookup uses the existing bearer-authenticated private switch bridge. The *98 SIP route is placed after caller authentication and account matching. Users cannot specify a mailbox UUID to retrieve another user's messages. The recorder binds SIP only on `127.0.0.1:5062`; only the existing local Kamailio socket is identified as its endpoint. It has no HTTP/AMI listener, outbound dialplan, or public mailbox login. RTPengine converts browser WebRTC audio to recorder RTP and back. This is a voice-only service.

## Database and disk

`voicemail_mailboxes` stores tenant/user ownership, an opaque mailbox ID, enabled state, duration, configuration revision and applied revision. Audio and message metadata live under `/var/lib/olamide/voicemail/spool/voicemail/tenant-<tenant UUID>/<mailbox UUID>/`. Treat the complete spool and `/var/lib/olamide/voicemail/pins.json` as private backup data. The database dump alone does not include recordings. Disabling or suspending a user prevents routing/access; it preserves recordings. The inbox holds up to 50 messages; users should delete unwanted messages through *98. There is no automatic age-based deletion or email delivery in this version.

`olamide-voicemail.service` runs the private Asterisk 22.11.0 recorder. `olamide-voicemail-sync.timer` synchronizes configuration about every 30 seconds. Mailboxes remain pending until the agent confirms the mailbox and retrieval dialplan are loaded. The agent never runs user-provided dialplan/config content.

## Deployment validation and recovery

Before changing Kamailio, the playbook backs up source, its configuration, and the application database; runs API tests and syntax checks; builds web/API images; installs the checksum-pinned recorder; synchronizes mailboxes; checks the private transport; and validates a staged Kamailio configuration. If the Kamailio restart fails, its previous config is restored and restarted. Early source/build failures restore the touched source files. Later failures preserve the backup and print its path. Existing calls may be interrupted by the final Kamailio restart.

The installer only accepts the reviewed routing anchors. If a route differs, it stops before replacing Kamailio's configuration. Configuration-check logs are root-private because configuration may contain existing switch credentials. Never publish those logs unredacted.

After deployment, verify real audio: call an assigned DID while its user is offline; leave a message; sign in as that user and dial *98; play/delete the message and record a greeting; test an unanswered internal call and cancellation. Test another tenant to confirm mailbox separation. Unit tests and a web build do not prove live SIP/RTP/DTMF interoperability. Do not test emergency calls.

Read-only checks:

```sh
systemctl status olamide-voicemail olamide-voicemail-sync.timer --no-pager
journalctl -u olamide-voicemail-sync --since '10 minutes ago' --no-pager
curl -fsS https://sip.dobhrap.com/api/health
```

To disable fallbacks during investigation, restore `kamailio.cfg` from the printed deployment backup, validate it with `kamailio -c -f /etc/kamailio/kamailio.cfg`, then restart Kamailio. Do not delete the database table or spool to roll back call routing.
