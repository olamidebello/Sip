# Nigeria SMS verification and in-house number retention

Deploy on root@sip with no active calls:

```bash
ansible-pull -U https://github.com/olamidebello/Sip.git \
  -C main -d /opt/olamide-deploy-controller -i localhost, -c local \
  deploy/ansible/inhouse-verification-lifecycle.yml
```

New allocations require an active subscription AND verified control of an existing
Nigeria number. The dialer's “Free in-house number” panel generates an 80-bit
random code, bound to the signed-in user, tenant and declared Nigeria number.
Send the exact code from that number to +12109050290 within ten minutes. Five
requests per day and at least 60 seconds between requests are enforced. Codes
are stored as hashes, replaced on a new request and consumed once. Only SMS
events accepted by the existing authenticated Flowroute webhook enter this
verification path; browser-supplied sender fields are never accepted as proof.
The actual sender must match the declared +234 number and actual recipient must
match +12109050290. This establishes control of the SMS sender number, not physical
presence in Nigeria. Existing GPS/geographic calling controls remain separate.

The verification destination must be SMS-enabled with the provider and already
deliver messages to this platform's authenticated webhook. This deployment does
not change the provider's number configuration or guarantee international SMS
delivery. Carrier SMS fees can apply. No code is sent by the server on the user's
behalf; the user sends it from their Nigeria SIM/number.

Successful verification triggers included-number allocation from existing
available inventory. If stock is unavailable, verification is retained and the
maintenance worker retries. Previously allocated numbers are not instantly
deleted: they retain their existing 30-day window, but verification is required
to renew eligibility through qualifying activity.

Default retention: at least one answered inbound or outbound call lasting 60
seconds within a rolling 30 days. Login, chat, failed and short calls do not count.
The browser panel shows days remaining. In-app reminder records are created at
seven days remaining, one day remaining and expiry; no email/push reminder is
sent by this release. Maintenance runs hourly while the API is running. There
is no claim of an independent carrier CDR reconciliation service.

Free call activity uses the existing authenticated durable dialog-event queue;
external activity uses settled PSTN call records. Activity must occur after the
current assignment date. Duplicate events cannot extend a call twice or create
a wallet charge. In-house activity does not create wallet reservations.

Expired numbers are removed from the owner, disabled for a seven-day hold, and
then returned to available inventory. An active recorded call prevents reclaim.
Verification is cleared on reclaim, requiring a fresh SMS challenge before a new
allocation. Subscriber chat/history and prior invoices are not transferred to a
new owner. Number reuse can still receive future calls intended for the former
owner; the seven-day hold reduces but does not eliminate that risk.

Backups use the existing private inhouse-free-* deployment directories. Schema,
activity and completed allocation/reclamation changes are retained on file/image
rollback. Call event capture, provider webhook delivery, reminder behavior and
reassignment must be verified on a staging account before relying on live
automated reclaim. No billable test calls/SMS are placed by deployment.
