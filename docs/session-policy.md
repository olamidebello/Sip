# User session limits

Default: one session per user. Every successful password, LDAP or passkey login
keeps the new session and revokes older sessions beyond the configured limit.
Failed authentication does not revoke valid sessions. Per-user database locks
serialize concurrent logins across API replicas.

Super admin → User sessions lists up to 500 users in the selected tenant, active
session counts and limits. Set an integer from 1 to 20. Reducing a limit ends the
oldest excess sessions immediately. Limits apply to every role including super
admins; there is no implicit exemption. Set 1 to restore the default behavior.
Existing pre-upgrade sessions have no historical creation timestamps; migration
assigns a common timestamp, so ties are resolved deterministically. New logins
always keep the newly created session. Existing sessions are trimmed at the next
login or when their limit is saved.

Revoked cookies fail authenticated API requests immediately. Meetings on the
same API instance are closed after commit; other instances recheck sessions at
most every five seconds and also before handling signaling messages. Open app
clients check their session every five seconds and on focus, stop app SIP/media,
and return to sign-in after revocation. Offline/suspended browsers detect this
when resumed. Browser tabs sharing the same cookie count as one session. Standalone
SIP clients using previously revealed SIP credentials are separate switch
registrations; web session revocation does not invalidate those credentials.

After GitHub deployment CI passes, run as root on the existing server:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-session-policy.sh
```

The isolated Ansible workflow validates the exact checked-out release, backs up
MySQL, builds the API/web/migration images, applies additive migrations and checks
public HTTPS health. This backend change requires this full deployment; the
messaging-only installer rebuilds just the web interface. Restarting the API can
close existing meeting signaling connections.

Acceptance: log into one account in two different browsers; the first must lose
API access and return to sign-in. Set its limit to 2 and repeat; both remain valid.
Create a third login; only the oldest is revoked. Reduce to 1; only the newest
remains. Verify regular and tenant admins cannot change limits, cross-tenant user
IDs are rejected, failed passwords leave current sessions intact, and parallel
logins cannot exceed the limit.
