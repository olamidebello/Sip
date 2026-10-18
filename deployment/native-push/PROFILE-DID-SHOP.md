# Profile DID purchase installer

Run after the profile-completion deployment at 91c6730. The installer builds API and web, tests DID pricing and existing billing, backs up billing records privately, validates Kamailio before changing it, installs the inbound route, starts schema migrations and provisioning workers, and checks application health inside the API container. Activation failures restore the previous API/web images and switch configuration. Additive database tables remain for investigation.

```
ansible-playbook -i localhost, -c local deployment/ansible/install-profile-did-shop.yml
```

The existing caller-ID, location and country Compose overrides are required and preserved. Include `/etc/olamide/compose.didshop.yml` in every subsequent deployment together with those overrides. Recovery files live in `/etc/olamide/didshop-backups` and contain confidential records; keep them private.

Users: My profile → My phone numbers → Purchase DID. Select a country and state/province, search inventory and see setup/monthly retail prices. Both prices use supplier cost plus 30%, rounded upward to cents. Users do not receive wholesale fields. Flowroute inventory coverage and region metadata determine available results; a listed country does not guarantee purchasable numbers.

Super admin: Admin → carrier controls → Profile DID sales and recurring billing. Configure Flowroute API credentials in existing provider settings; configure an enabled live Stripe gateway in existing payment settings. Then click Configure / verify recurring Stripe billing. This creates a dedicated signed webhook and customer billing-portal configuration. DID purchases remain disabled until these prerequisites and inbound routing are ready. Setup creates no real purchase or customer charge.

Checkout authorizes setup plus first month and automatic monthly rental. Signed live `invoice.paid` confirmation triggers provisioning. The profile shows provisioning/payment state and enables primary-DID selection after activation. Manage monthly payment / cancel opens Stripe's hosted portal. Cancellation releases the DID at the end of the paid period. Failed renewal suspends service at expiry and releases the DID after seven days. Released telephone numbers may not be recoverable. The provider must permit the acquisition and route configuration.

Acquisition timeouts and interrupted purchases are deliberately marked for reconciliation; they are never blindly repurchased. Administrators can retry safe route/account provisioning. Refunds and ambiguous provider ownership require review in Stripe/Flowroute. This version does not provide every possible carrier or payment administration operation in the local GUI.

This installer does not add the separately requested wallet top-up/profile call-rate search enhancements. Existing call charging and trial allowances are preserved. Tests use local fixtures and mocks; real paid acquisition, provider delivery, customer subscription renewal and live two-way audio must be verified on the deployed server.

## Purchased DID SMS

The installer also migrates messaging setup and idempotent-send records and starts a 30-second provisioning worker. Paid active DIDs request Flowroute messaging activation, track the provider task, install per-number SMS and delivery callbacks, and become assigned SMS senders when activation is confirmed. Voice provisioning remains available while messaging activation is pending.

My phone numbers shows SMS status and a Send / receive SMS button when ready. The existing External SMS screen provides sender selection, compose, inbox, sent history and refresh. Super admin Purchased DID messaging controls enablement, daily submitted-message limits (default 100), and setup retries. Disabling locally blocks sends and receipt ingestion; it does not cancel provider messaging service fees. Carrier messaging fees are separate from DID monthly rental and this version does not deduct SMS usage from the wallet.

Callbacks use private per-DID random tokens and authenticated provider message-record readback. Unverified payload bodies never enter the inbox. SMS is carrier text messaging and is not the encrypted private chat feature. Provider eligibility, applicable messaging registration, account approval and delivery restrictions can prevent activation or delivery; this installer cannot bypass those requirements. Uncertain sends keep their request key and are not automatically repeated.

## Automatic Flowroute configuration

Run `deployment/ansible/provision-flowroute.yml` to build/install the complete DID/SMS release and then apply carrier configuration. It commissions the saved IP gateway, verifies tenant API access, configures the dedicated live recurring-billing webhook, processes eligible already-paid acquisitions, verifies/reconciles purchased DID voice routes, and requests SMS activation with per-number inbox and delivery callbacks. Existing super-admin SMS disablement and daily limits are preserved.

Only application-owned paid active DIDs receive route updates. Unrelated numbers are not claimed or modified. Ambiguous acquisitions and interrupted messaging activation require review. Provider task processing is asynchronous and continues in the worker after the play ends. A sanitized summary reports credential setup needs, verified voice routes, ready/pending SMS and review counts.

Flowroute API credentials, account funding/approval, IP allowlisting and any carrier messaging registrations must already be supplied or approved by the account owner. The playbook cannot fabricate these prerequisites. Local syntax/unit/build tests do not establish live provider acceptance.
