# Twilio provider roles

Administrator > Providers & Routing > Twilio > Twilio provider roles.

Twilio is registered once with stable provider ID twilio in carrier_provider_catalog. Four independently controlled roles are stored in twilio_provider_roles: trunk, otp, did, sms. Registration itself leaves the generic carrier catalog disabled/draft; this is not a switch commissioning acknowledgement. Existing display-name/lifecycle management remains available through the provider manager. No core Flowroute/DIDWW/SmoothDID routes are replaced.

- Trunk: list or create a remote Elastic SIP trunk, save its TK SID, then stage its verified termination domain in a disabled local PBX trunk and draft carrier profile. A secure remote trunk stages TLS/5061; otherwise UDP/5060. Remote account ownership is checked, and an active local profile cannot be changed. Creation uses a persisted request key and never automatically retries uncertain results. No IP ACL, credential list, origination URL, switch termination adapter, correct Elastic SIP rate deck or media path is invented. PSTN traffic remains blocked until those are commissioned. Programmable Voice pricing is not an Elastic SIP tariff.
- OTP: inspect the configured Verify Service. Existing caller-ID phone verification uses Twilio; disabling the OTP role removes the hub-backed verification credentials and prevents automatic setup from re-enabling it. This does not change the application's login MFA/OTP implementation. Remote funding, geographical permissions and delivery require testing.
- DID: search available voice-capable Local/Mobile/TollFree numbers by ISO country code, optionally requiring SMS. Display actual capabilities/address requirements and country/type rental prices plus 30%. No number is bought by search. Acquisition, regulatory bundle approval, unique allocation, renewal and inbound routing are still managed setup requests, not an automated DID-shop adapter.
- SMS: inspect the configured Messaging Service and its sender pool. This establishes the provider configuration; it does not connect the customer composer, sender ownership, callbacks or metered billing to Twilio. Existing Flowroute SMS delivery remains unchanged. Do not describe inventory inspection as successful message delivery.

All new endpoints require super_admin and tenant scope. User-supplied URLs are not accepted; remote operations use fixed Twilio hosts and validated resource SIDs. No new plaintext credential store is introduced. The installer registers role availability for active-super-admin workspaces without calling Twilio or buying/sending anything. Saved role preferences are preserved on repeat installations.

32 mocked API/DOM tests cover roles, permissions, fixed endpoints, account binding, safe staging, credential gates, prices, provisioning retry behavior and existing hub functions. Real trunk authentication, call/media interoperability, DID purchases/renewals, SMS sending/delivery and wallet metering remain separate commissioning work.

Official references checked October 22, 2026:
- https://www.twilio.com/docs/sip-trunking/api/trunk-resource
- https://www.twilio.com/docs/phone-numbers/api/availablephonenumberlocal-resource
- https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource
- https://www.twilio.com/docs/messaging/api/service-resource
- https://www.twilio.com/docs/verify/api/service
