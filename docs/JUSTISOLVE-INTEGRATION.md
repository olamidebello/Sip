# Scoped JustiSolve phone integration

The JustiSolve platform uses `POST /api/integrations/justisolve/*` with a dedicated
64-character hexadecimal `JUSTISOLVE_BRIDGE_TOKEN`. The token is server-only and
is not a general SIP administrator credential. Docker Compose passes it to the
API. The companion JustiSolve playbook `ansible/link-phone-services.yml` configures
both existing servers without printing the shared token.

The bridge creates integration-owned tenants and identities keyed by personal or
organizational source context and account IDs. Existing accounts are never adopted
by matching email. Identity emails are internal `.invalid` aliases, passwords are
random and unknown, and no JustiSolve password is sent. Staff/counsel receive user
accounts; only source workspace owners/admins receive tenant-scoped PBX admin roles.
No source user receives SIP super-admin rights.

Provisioning is idempotent under a per-context database lock. Organizational
identities receive extension records. SIP switch activation, PBX queue/public
routing commissioning, carrier funding and subscriptions remain independent.
The source delegates exact identity call authorization before browser dialing.
Only a small fixed PBX action list is supported by the bridge. Existing PBX
readiness notes continue to distinguish records from commissioned routes.

Identity eligibility uses renewable ten-minute leases. A 30-second expiry sweep
pauses expired mapped users and deletes sessions. API sessions and local password
login also enforce the identity lease, so a changed login method cannot bypass
source expiry. Source removal/suspension propagates on its next synchronization;
network outages fail closed after the lease window. Existing live calls are not
terminated by this mechanism.

`/api/justisolve/redeem` accepts only same-origin POSTs with a one-use 60-second
ticket. It creates a bounded session through the existing session-limit code.
The public `/justisolve-connect.html` page removes the URL fragment before
redeeming the ticket. The service's normal passkey interface restrictions remain.
Per-user SIP credentials and short-lived TURN credentials are supplied only for
the bridge-bound identity; no shared bridge token is passed to a browser.

Focused validation covers bridge authentication, context binding, idempotence,
role limitations, portal origin/expiry, existing SIP session scoping, session
limits and PBX behavior. The unrelated route-contract inventory test already
fails for older UI destinations on the pre-integration revision; that issue is
not caused or repaired by this integration.
