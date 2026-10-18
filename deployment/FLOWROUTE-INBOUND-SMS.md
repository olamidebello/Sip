# Flowroute DID calling and SMS

Deploy as root from the existing server checkout:

```sh
ansible-playbook -i localhost, -c local deployment/ansible/flowroute-inbound-sms.yml
```

This builds API/web, applies the existing additive migrations, preserves Docker overrides and callback secrets, and stages the entire Kamailio config for validation before changing it. A failed service activation restores the previous SIP config. It does not reset Git or discard local files.

## Setup

1. Save Flowroute API access/secret keys in Administration > Carrier credentials (SIP credentials are separate).
2. In Administration > Security & integrations > Messaging webhooks, assign the Flowroute DID in `+E.164` format to its active user and set a daily SMS allowance. Saving verifies that the DID exists in the configured Flowroute account. Existing conflicting assignments must be resolved first.
3. Click Configure voice and SMS routes for that DID. Use the public SIP host `sip.dobhrap.com:5060` (or the server public IP with `:5060`). This changes that DID's primary voice route and its inbound SMS and delivery receipt callbacks through the Flowroute API. A partial failure lists which operations succeeded; rerunning reapplies callbacks and reuses a matching voice route.
4. Users open Chats > SMS messages to select a conversation, read received messages, or send/reply from an assigned DID. SMS refreshes every five seconds while the section is open. SMS is persisted even when the browser is offline; SIP registration is not required to receive SMS. Existing external SMS inbox/sent pages remain available.
5. The DID owner must be registered in SIP to receive inbound voice calls. An offline user returns SIP 480. Unknown/ambiguous DIDs return 404. Calls do not fall through to paid outbound routing.

## Database and boundaries

Uses existing `flowroute_sms_numbers`, `flowroute_message_events`, `flowroute_sms_outbound`, `inhouse_dids`, `did_quotes`, `sip_accounts`, `users`, and `tenants` tables. No duplicate messaging database or shadow user accounts are created. Active DID ownership is resolved from enabled Flowroute number assignments, assigned in-house numbers, or fulfilled Flowroute quotes; conflicting owners deny delivery. A single Flowroute carrier workspace is selected by the preserved `FLOWROUTE_WEBHOOK_TENANT_ID`.

SMS webhook URLs contain a preserved random secret. Numbers are canonicalized before ownership lookup. Duplicate callback event IDs are stored once. Conversations are scoped to the authenticated recipient and DID; reassignment does not expose prior owners' message history. Send request IDs use the existing outbound primary key, reserving daily quota and inserting the pending request in one transaction. Retries of pending/unknown/rejected requests never resubmit to the carrier. Daily allowance is an SMS count cap; this change does not introduce a wallet SMS tariff.

Inbound SIP is allowed only from Flowroute's documented US Oregon/Virginia signaling ranges (`34.210.91.112/28`, `34.226.36.32/28`), checked at the switch and private authenticated lookup. It converts carrier RTP to browser DTLS/SRTP and the browser answer back to RTP. Other PoPs require verified range updates in both files. Existing in-dialog routing remains in charge of ACK, BYE and re-INVITEs.

Carrier messaging activation, 10DLC/toll-free approval where applicable, carrier balance and reachable SIP/media firewall ports remain necessary. The configuration button does not submit registration applications, purchase a DID, or send a paid test message. Production ringing, two-way audio, real inbound SMS and carrier delivery must be tested after deployment.

References:
- https://developer.flowroute.com/api/messages/v2.2/receive-an-sms/
- https://developer.flowroute.com/api/numbers/v2.0/set-a-messaging-callback-url-for-phone-number/
- https://developer.flowroute.com/docs/set-up-inbound-routes-for-phone-number/
- https://developer.flowroute.com/docs/inbound-and-outbound-calling-with-flowroute-new-pops/
