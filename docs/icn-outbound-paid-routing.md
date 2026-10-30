# ICN paid outbound routing

This release implements a paid ICN branch. It is not the older read-only
`icn-outbound-preflight.yml` playbook. Production activation requires the
carrier's authorization of 154.29.77.102 and reviewed settings below.

## Deploy on root@sip (154.29.77.102)

Copy `deploy/ansible/icn-activation.example.yml` to
`/etc/olamide/icn-activation.yml`. Fill the carrier approval reference, approved
caller-ID format, exact tenant UUIDs and reviewed destination prefixes. Set
carrierApproved to true only once approved. The chosen customer billing defaults
are 60/60, adjustable to 1–60 seconds; these are an application setting, not a
claim about ICN's contractual billing increments or taxes. Prefixes must be
reviewed against the carrier's full rate deck; the screenshot supplies categories
but not a complete prefix deck. No catch-all prefix or guessed exchange rate is
installed.

```
ansible-pull \
  -U https://github.com/olamidebello/Sip.git \
  -C main -d /opt/olamide-deploy-controller \
  -i localhost, -c local \
  -e @/etc/olamide/icn-activation.yml \
  deploy/ansible/icn-outbound-activate.yml
```

Do not run while calls are active; the playbook checks the dialog count before
restarting Kamailio. It requires the existing authenticated HTTP bridge, durable
`olamide-billing-queue` service, prepaid route, and inventory directory API mount.
It patches recognized code only, validates staged Kamailio configuration before
promotion, builds/tests the API image and saves private backups. Unknown layouts
stop before promotion. It adds only ICN's exact SIP source to UFW. Existing media
range 30000–40000/UDP is preserved. It does not replace live Compose or Caddy files.

## Routing and validation

For configured tenants, Nigeria destinations from users with purchased SmoothDID
rentals take the ICN branch before the existing carrier identity resolver. One
active rental is selected automatically; multiple rentals require preferredDids.
No client-supplied caller ID is trusted. Rental, inventory owner, tenant, expiry,
status, group ICN voice permission, session-bound geographic proof, ICN policy,
calling window and fraud rules must pass. An expired/suspended rental does not
silently fall back to Flowroute. Users without a SmoothDID rental retain their
existing route. Non-Nigeria calls retain their existing route.

Existing admin provider management must allow ICN voice. Configure the DID group's
voice readiness, ICN interconnect and geofences, and the ICN location policy's
enabled areas and caller DIDs. The ICN destination format must be confirmed in
that policy. These restrictions are not auto-erased or broadened by deployment.
No DID inventory is fabricated or assigned by this playbook.

The fixed peer is 196.216.253.173:5060/UDP, source 154.29.77.102:5060. National
destination formatting is applied only after authorization. Caller-ID formatting
uses the approved setting. RTPengine converts WebRTC SDP to RTP/AVP toward ICN
and returns WebRTC SDP to browser clients. G.711 PCMA/PCMU are offered. G.723/G.729
transcoding is not introduced. Existing in-dialog routing is retained; hold/resume
and carrier-initiated re-INVITEs require acceptance testing on the live switch.

## Charging and settlement

The supplied NGN/minute base prices are GSM buy 4.45/sell 8.00 and other networks
buy 5.25/sell 10.00. Longest matching reviewed prefix selects the category.
The existing validated tradeNAIRA cache is used for USD charging only for these
ICN calls; a missing or older-than-36-hour quote rejects new calls. This changes
ICN from display-only conversion to explicit call-time billing conversion.
The USD selling rate is rounded upward to six decimals, then existing integer
cent ceiling/interval rules apply. A very short or inexpensive call can therefore
have a one-cent minimum charge. Wallet currency must be USD.

The tenant lock and wallet row lock protect the reservation; concurrency,
calling-window, fraud and international allowance checks remain in force.
The NGN buy/sell rates, exchange rate/time, DID and approval reference are saved
in `icn_call_tariffs`; the USD rate, intervals and maximum funded duration are
saved in `pstn_calls`. Retries with the same authorized call key do not debit
again. Settlement uses that stored USD rate, never a refreshed exchange quote.
The existing durable dialog start/end/failed event queue drives `settlePstn`:
answered calls are charged for rounded billable time, unused reservation is
refunded, and failed calls refund the reservation. Duplicate events do not charge
twice. Contradictory events/over-budget duration stay pending for reconciliation.

Do not blanket-refund old pending calls: a call may still be active or its events
may be queued. Monitor the durable event queue and pending reservations. Automatic
carrier CDR reconciliation is not included. Buying NGN amounts are audit values,
not a carrier invoice ledger with taxes or actual carrier rounding.

## Rollback and live acceptance

Private backups are under `/opt/olamide/backups/icn-outbound-*`; the latest path
is in `/opt/olamide/backups/icn-outbound-latest`. The error trap restores source,
configuration, previous API image and switch configuration. Database call records
and wallet entries are preserved, never rolled back by file restoration. The
additive tariff table also remains. An old API image can settle calls using the
stored existing pstn_calls rate/interval fields.

After deployment, test an authorized owned DID to an approved Nigeria number:
confirm carrier acceptance, CLI, audio both ways beyond two minutes, hang-up,
one reservation and one settlement/refund. Then test busy/rejected calls,
duplicate events, insufficient balance, expired rental and wrong-tenant access.
No billable call is automatically placed by deployment. Installation health does
not establish carrier commissioning or solve unrelated one-minute disconnects.
