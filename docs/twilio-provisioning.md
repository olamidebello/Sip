# Twilio resource provisioning

`deploy/ansible/twilio-provision-local.yml` automates the remote **resource layer** using encrypted credentials already saved in the Twilio super admin GUI. It does not implement or activate the missing runtime adapters. Successful resource provisioning is not live-service commissioning.

It validates the active account, adopts or creates a tenant-named Verify Service, Messaging Service, Elastic SIP trunk, IP access list and exact /32 signaling egress IP, then associates that ACL with the trunk. An optional explicit origination URI can be added. It saves the service/trunk SIDs to existing settings with optimistic versions. Existing disabled roles and conflicting trunk configuration stop the workflow. OTP remains caller-ID verification; the playbook does not alter login authentication or enable the caller verification security policy.

Run in plan mode first. No keys are accepted on command lines, copied into reports or printed. A funded authorized account and API permissions must already exist. The installed API image must contain the prior Twilio provider-role update (`twilioRoles.js`, `twilioHub.js`). The playbook stops rather than silently installing different source over host-local integrations.

```sh
ansible-playbook -i localhost, -c local /root/twilio-provision-local.yml
ansible-playbook -i localhost, -c local /root/twilio-provision-local.yml \
  -e '{"twilio_apply":true}'
```

Override `twilio_tenant_id`, `twilio_public_ip` and `twilio_domain` for another tenant/host. For an already configured trunk, supply its existing domain. `twilio_origination_uri` defaults to empty because inbound routing/firewall commissioning has not been verified. Only `sip:<configured IPv4>:5060;transport=udp` is accepted by this initial workflow.

No calls, customer messages or phone-number purchases are made by this playbook. Number purchases belong to authenticated customer orders with a quote, accepted rental terms, wallet reservation, regulatory prerequisites and unique allocation; a deployment cannot infer those customer authorizations. Unknown/starting remote operations are never replayed. If an exact matching resource is later found, it can be adopted; ambiguous or absent resources require reconciliation. A crash after remote success can leave resources behind. No destructive remote rollback is attempted.

The sanitized report is `/opt/olamide/reports/twilio-provision-<tenant UUID>.json`. Its `live` field remains false and lists the current runtime blockers. Set `twilio_require_live=true` (JSON boolean) to make automation fail until those blockers are addressed; current code deliberately fails that gate.

## Remaining runtime work

* Twilio must be added to `pstnBilling.js`, carrier commissioning and Kamailio routing together. Removing the provider allowlist alone would bypass the current commissioning gate. Confirm signaling authentication, caller-ID authorization, rates, concurrency, media handling and two-way audio before activation.
* Automated DID orders need country/type pricing, regulatory Address/Bundle SIDs where required, transactional wallet holds, provider purchase reconciliation, globally unique allocations, inbound routing, recurring rental/release rules and customer UI integration.
* Customer SMS needs authorized sender ownership, current segment/carrier pricing, wallet reservation, definitive rejection versus uncertain acceptance, provider-ID reconciliation, delivery status and inbound callback verification. Sender ownership must prevent sending a Flowroute-only DID through Twilio merely because its price is lower.
* Least-cost routing must filter each candidate by provider status, commissioned adapter, current user location/geofences, exact caller-ID/sender authorization, destination permissions, fresh complete rates and available capacity before comparing like-for-like landed provider cost. Compare billing intervals for calls and segments plus carrier fees for SMS. Apply cost plus 30% once to the selected provider cost. Unknown acceptance must hold the original operation for reconciliation without cross-provider retry. Existing wallet, trial, fraud and service access checks remain mandatory.

Pricing: use Twilio's Elastic SIP Trunking Pricing resource (`pricing.twilio.com/v2/Trunking/Numbers/{DestinationNumber}` with `OriginationNumber`) for SIP termination, not Programmable Voice pricing. Flowroute candidates require effective imported rate decks when no supported live pricing API is available. Missing/ambiguous prices must not be treated as zero. This playbook does not yet wire that selection into runtime submissions.

References: https://www.twilio.com/docs/sip-trunking/api ; https://www.twilio.com/docs/sip-trunking/api/ipaccesscontrollist-resource ; https://www.twilio.com/docs/voice/sip/api/sip-ipaddress-resource ; https://www.twilio.com/docs/sip-trunking/pricing-trunking-resource
