# Twilio provider hub

Admin location: Administrator > Providers & Routing > Twilio — provider, products & pricing. Customer location: Money/Billing > Twilio services marketplace.

This release provides a 37-entry product-family catalog with requirements, per-tenant visibility, encrypted write-only Twilio credentials, separate SendGrid/Segment credential storage, account authentication checks, owned-number/service inventory, today's account usage reporting, live Voice/SMS/phone-number pricing, Verify and Messaging Service creation, and customer setup requests with cost-plus invoices paid through the existing wallet. It is not a complete runtime implementation of every Twilio product. Product cards explicitly identify setup-required adapters. No remote purchases, messages, calls or deployments are made during installation.

## Setup

1. Save Account SID and Auth Token or API key SID/secret under the Twilio provider. The existing voice-verification integration requires Account SID + Auth Token + Verify Service SID. Secrets are AES-256-GCM sealed using existing PROVIDER_CREDENTIAL_KEY and tenant-specific AAD; blank inputs preserve saved values. Do not rotate the master key without re-encrypting existing provider credentials.
2. Enable the hub, then run Account authentication. Restricted API keys may need additional permissions for particular checks. An HTTP success verifies only that operation, not every product entitlement.
3. Use existing service inventory, or create one Verify/Messaging Service. Creation is protected by persisted request keys. Uncertain responses are not retried automatically. Save the returned VA/MG SID in settings.
4. For caller-ID phone verification, open Security > DID verification service & restricted account. Enable verification calls and allow destination prefixes such as +1 or +234. Hub credentials are reused; the existing cooldown, quotas, code checks and caller-ownership restrictions remain. Saving a disabled hub blocks hub-backed verification. With no hub configuration, legacy verification settings continue to work.
5. Complete each product's listed registration, sender/domain, entitlement, application and callback requirements before fulfillment. Keys alone do not commission SIP termination, fix Nigeria media, approve WhatsApp/RCS senders, register 10DLC or configure SendGrid/Segment.

## Price policy

Provider cost × 1.30, represented as decimal arithmetic with eight decimal places. Payable invoices round the marked-up total upward to cents. Example: USD 10.00 becomes USD 13.00; USD 0.0085/min becomes USD 0.01105000/min. Do not round each minute/segment to cents and then multiply; quote the complete provider cost for the service/period first.

Live indicative pricing uses Twilio account-specific APIs for Voice, Messaging and PhoneNumbers; SMS units remain per segment. USD only; other currencies fail closed rather than inventing an exchange rate. Carrier fees, taxes, registration, recurring rentals and other components need their own actual provider cost lines. No universal API supplies all product prices. Products without supported price adapters require an administrator-entered provider cost and source reference.

Customer requests do not charge a wallet. A super admin reviews a request and records its complete provider cost/source. The backend creates an unpaid invoice using fixed 30% markup; the customer explicitly pays it through existing wallet controls. Payment is idempotent through wallet_purchases and invoice state. Fulfillment requires a paid invoice and a verified provisioning reference; changing a database status is not evidence that every external runtime integration is operational. Unquoted requests can be rejected. Quoted/paid invoices remain under existing invoice/refund controls.

There is no automatic per-call/per-message Twilio usage debit, account-aggregate allocation, subscription renewal, inbound callback handling, generic remote-resource editor, SendGrid sending, Segment ingestion or Flex/Video/AI client implementation in this release. Existing Kamailio/Flowroute/DIDWW billing and media routes remain unchanged. Twilio usage aggregates are displayed for reporting only and must not be charged to users as overlapping categories can double count.

## Security and validation

Admin endpoints enforce super_admin and tenant scope. Customer request/payment endpoints bind the authenticated user and tenant. Credentials are never returned. Provider HTTP calls use fixed HTTPS hosts/paths, redirect refusal and timeouts; numeric provider error codes are surfaced without arbitrary error bodies. Remote mutation results are tracked for reconciliation. Data rendered in UI uses textContent.

17 tests cover exact prices, credential validation/redaction, role gates, approved fixed endpoints, non-USD rejection, provisioning retry behavior, paid fulfillment, invoice amounts and UI paths. Tests use database doubles and mocked provider HTTP calls; real MySQL behavior, account permissions, live service creation, end-to-end wallet checkout and product delivery still require validation on the server.

## Official references checked October 22, 2026

- https://www.twilio.com/en-us/products
- https://www.twilio.com/docs/usage/api
- https://www.twilio.com/docs/iam/api/account
- https://www.twilio.com/docs/verify/api/service
- https://www.twilio.com/docs/messaging/api/service-resource
- https://www.twilio.com/docs/voice/pricing
- https://www.twilio.com/docs/messaging/api/pricing
- https://www.twilio.com/docs/phone-numbers/pricing
- https://www.twilio.com/docs/usage/api/usage-record
