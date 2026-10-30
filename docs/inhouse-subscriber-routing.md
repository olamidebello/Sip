# Subscriber-included Smooth in-house DIDs

The licensed range is +2342031500000 through +2342031549999. An active subscriber
receives an available in-house number from existing assigned/available inventory
in their tenant. Existing owned assignments are adopted first. One included
number per subscriber is provisioned automatically. The subscriber's allocation
is not a paid rental: no invoice or wallet debit is created. Existing historical
invoices are preserved; no retrospective refund is performed. Auto-renewal fees
for adopted Smooth rentals are disabled, and the paid rental endpoint rejects
subscriber purchase requests with an included-number explanation.

Run on root@sip with no active calls:

```bash
ansible-pull -U https://github.com/olamidebello/Sip.git \
  -C main -d /opt/olamide-deploy-controller -i localhost, -c local \
  deploy/ansible/inhouse-subscriber-free.yml
```

The playbook installs the API policy and stages/validates an ICN inbound switch
route, builds/tests the API, restarts the switch only with no active dialogs, and
then assigns numbers to active subscribers. It reports inventory shortages or
pending assignment errors. Only existing approved available inventory is used;
no number block is fabricated. Subscriber allocations are also checked lazily
when the dialer requests `/api/softphone/access`; its response includes the
includedDid. The current shop may still show old rental pricing, but active
subscribers cannot be charged by that purchase endpoint after this deployment.

## Free in-house calls

Authenticated subscribers dialing a number in the in-house range are resolved
to its assigned active subscriber's SIP account before any prepaid reservation.
The route can reach another active platform subscriber across workspace ownership
without exposing their account details to a caller-facing API. Both accounts must
use the same platform SIP domain for switch on-net routing. DND is respected.
Unassigned/offline numbers fail without carrier fallback. No wallet table is
updated for these calls. Direct SIP usernames retain existing workspace controls.

## External inbound calls

ICN-originated initial INVITEs are accepted only from 196.216.253.173 to a number
in the licensed in-house range. An authenticated private bridge lookup resolves
the unique active assigned owner. Kamailio routes to their registered contact,
with RTPengine translating the carrier RTP leg and browser media leg. Unassigned
numbers, inactive subscribers, DND and offline accounts are rejected. This inbound
path does not create outbound wallet reservations. Subscriber subscription status
is checked on each new call; numbers are not automatically recycled on expiry.

ICN must actually route the number range to 154.29.77.102:5060/UDP; this playbook
cannot configure ICN's network. It adds the exact peer firewall allowance and
preserves the public RTP range. The existing bridge token is read privately from
the billing queue config. Other carriers are not automatically trusted. No public
unauthenticated HTTP routing endpoint is exposed.

## External outbound calls

Calls outside the in-house range remain charged. ICN outbound accepts an included
subscriber assignment without a rental invoice, while retaining subscription,
ownership, tenant, geographic, carrier approval, balance, tariff and settlement
checks. Install the included-number policy before the ICN outbound adapter.
The automatic ICN playbook installs this policy first and discovers included
numbers alongside any previous paid rentals.

Source/image/switch backups are private under /opt/olamide/backups/inhouse-free-*.
Failed API or switch promotion restores prior files and image. Completed database
assignments and disabled rental renewals are retained; they are not erased by
file rollback. Assignment runs after successful promotion. No test calls are
placed automatically. Verify an internal call, an external inbound call, two-way
audio and an external charged call before treating carrier service as live.
