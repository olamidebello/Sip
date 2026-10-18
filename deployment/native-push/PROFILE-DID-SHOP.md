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
