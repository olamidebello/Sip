# SIP reconnect rate-limit repair

Previously every write request shared a 20-per-minute socket-IP bucket. The
Compose Caddy proxy can make many users appear to share one socket IP. Contact
imports and background activity could consume the bucket before SIP setup ran.

The API now identifies real clients only when the peer resolves to the Compose
web/Caddy service; untrusted forwarding headers are ignored. Authentication and
anonymous requests remain limited to 20 per client per minute. Authenticated
requests use verified account IDs, never an unverified cookie hash.
Separate default per-user budgets are SIP setup 20, activity 60, contact writes
120, native push writes 60, and other actions 120 per minute. API_RATE_LIMIT
changes the other-actions budget; AUTH_RATE_LIMIT changes the authentication
budget. A 600-write-per-client edge budget runs before authentication queries.
Limits are local to each API replica. Existing database-level messaging,
activity and billing authorization/rate checks are still enforced.

HTTP 429 includes Retry-After. The app pauses SIP credential requests for that
period (at least 60 seconds); online/focus/reconnect events cannot bypass it.
A new app login still starts normal automatic SIP setup. Registration must
receive SIP acceptance before it is marked connected.

After GitHub CI passes, deploy both API and web:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-messenger-features.sh
```

Refresh the browser after deployment. Confirm the SIP account connects, then
import contacts or navigate the app and confirm those actions do not interrupt
SIP registration. The web-only deployment does not install this backend fix.
If the switch later rejects REGISTER, collect the connection-status code; this
repair addresses HTTP throttling, not an unverified switch authentication fault.
