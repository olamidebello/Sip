# SIP marketplace and reseller stores

## Deploy

For an existing Debian 12 SIP server, after this release passes the repository's deployment CI:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-marketplace.sh
```

The playbook installs deployment tools, preserves an existing payment encryption key (creates one only when absent), backs up MySQL through the existing deployment workflow, builds the complete API/web application, applies all registered schema migrations, restarts API/web and checks HTTPS and marketplace schema readiness. Docker Compose and the base production installation must exist. A fresh host uses `deployment/install-all.sh` with the documented domain and public-IP parameters first. There is no general-purpose script that can implement missing source code or automatically commission external services.

## Super administrator

Open Administration → Payments. Marketplace controls are below Stripe management. Create tenant workspaces and tenant administrators through the existing tenant administration screens. Authorize each reseller workspace, enable its store, and optionally delegate payment-gateway administration. Use workspace switching to manage its catalog, orders and gateways. Disabling authorization or store availability blocks new store operations and checkout; it does not refund settled charges.

Existing workspaces with no marketplace policy retain legacy catalog access. Gateway delegation is denied until explicitly granted. Store policies control product-store operations; legacy dial-plan, DID and wallet workflows retain their existing policies.

## Reseller

A reseller is an administrator of its own tenant workspace, not a global role. It can only see its store authorization, rename its authorized store, import/edit/publish its own products, manage its orders, record fulfillment and configure its own payment credentials when delegated. It cannot authorize itself, change another workspace or grant its own gateway permission. The customer storefront is the signed-in workspace's Product store, not a public cross-tenant storefront.

## Suggested plans

The Add recommended SIP plans button inserts Personal ($9.95/month), Team ($29.95/month) and Business ($79.95/month), with draft reseller reference prices of $6.95, $21.95 and $59.95. These are proposed prices, not externally sourced market rates or cost guarantees. Imports preserve existing SKUs and prices. Edit terms, margins, delivery capacity and availability before publishing. These plans do not include unlimited minutes or DID rental, and adding a plan does not create service entitlements automatically. Paid orders require real provisioning and a fulfillment receipt. Existing renewal jobs create renewal invoices for active subscriptions; they do not automatically debit cards.

## Payments

Stripe uses the existing hosted checkout and signed webhook reconciliation. Authorized reseller administrators may now manage Stripe for their own tenant. Paystack and Flutterwave have additional hosted checkout adapters with server-side verification and tenant-isolated AES-GCM credentials using PAYMENT_CONFIG_KEY. Credentials are write-only. Mode changes require matching keys; live enablement requires explicit confirmation. Current marketplace invoices are USD; merchants must have USD acceptance enabled by the provider.

Customers choose a provider beside an unpaid invoice. Pending Paystack and Flutterwave payments are verified by a durable server worker. Customers may also open Billing and select Verify payment. The server verifies the reference, successful status, exact amount and currency against the provider API before marking the invoice paid. The worker verifies one eligible attempt every 15 seconds under a cross-replica database lock, with five-minute retry intervals. Pending attempts older than seven days are flagged for merchant review. Provider webhooks for these two providers are not implemented; Stripe retains signed webhook reconciliation. Do not rotate merchant credentials while payments are pending. For a failed initialization response, verify first; the server retains an open attempt to prevent automatic duplicate charges. Unresolved or abandoned attempts require operator investigation; there is no automatic forced reset.

The gateway catalog also lists PayPal, Square, Adyen, Braintree, Authorize.Net, Razorpay, Mollie, Checkout.com, Worldpay, Amazon Pay, Coinbase Commerce, Paddle, 2Checkout, PayU and Mercado Pago as **adapter not implemented**. They cannot be enabled or used for checkout. This catalog is not an exhaustive list of every payment company. Refunds, disputes, split settlements, payouts, tax automation, FX, public reseller domains and automatic service entitlement provisioning are not added by this release. Merchant credentials, account approval and a successful sandbox purchase are required before enabling live payments.

Provider references: https://paystack.com/docs/api/transaction/ and https://developer.flutterwave.com/reference/checkout and https://developer.flutterwave.com/reference/verify-transaction-with-tx_ref .

## Marketplace menus and database wiring

Administration → Marketplace & payments includes the dashboard, reseller authorization, catalog, orders and fulfillment, recommended plans, gateway administration, reconciliation and Stripe settings. Customer Marketplace includes the storefront and personal orders; invoices are under Billing. Draft creation, imports, product edits, publication, ordering, fulfillment, cancellation, renewal invoices, tenant authorization and gateway settings use their existing database-backed routes.

Dashboard aggregates initial order invoices only, in USD. It does not conflate renewal charges, refunds or provider settlement. Customer storefront branding uses the tenant store name. The new draft-creation form persists products in `store_products`. Authorization uses `marketplace_stores`; payment credentials use `store_gateways`/`payment_gateways`; attempts use `payment_attempts`; automated verification state uses `payment_reconciliation`.
