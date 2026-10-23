# Twilio DID checkout and provider labels

Deploy `deploy/ansible/twilio-did-checkout-local.yml` on the existing Olamide host after the Twilio hub/roles, geographic policy and DID availability integrations. Deployment backs up changed source and running API/web images, builds both images, runs API/UI checks, installs four additive tables and verifies health. It never purchases a number or enables a purchase policy automatically. Existing enabled policies are retained on redeploy.

The country/area inventory now labels every result using the first three letters of its provider display name, for example TWI (Twilio), FLO (Flowroute), DID (DIDWW) and SMO (SmoothDID). The legacy provider selector includes Twilio and opens the cross-provider inventory. Selecting a Twilio number opens a current-price quote and customer wallet checkout, rather than a generic setup request.

## Super-admin setup

1. Save live account credentials in Providers & Routing > Twilio. Run account and inventory checks. A read-only test does not prove permission to purchase/release numbers. Resolve previous 401/20003 authorization errors first.
2. Register/verify the TK trunk under Twilio provider roles. Configure and test its origination routing. Enable the Twilio DID role and the provider in provider management. Keep applicable geographic restrictions enabled.
3. Open **TWI · Customer DID purchases**. Choose US and/or CA, enter an operating/trunk acceptance reference and acknowledge provider rental liability. Save with customer purchases enabled. This is a tenant setting restricted to super admin, separate from trunk termination commissioning.
4. Customers search country/area inventory, choose **Quote / purchase**, accept the exact monthly amount and authorize recurring wallet charges. A funded USD wallet is required.

## Scope and billing

Automatic checkout supports **US/CA Local voice-capable numbers whose provider response says no address requirement**. Other types/countries remain searchable but cannot bypass regulatory/address requirements. Bundle/address collection and regulatory approval workflows are not implemented here. Setup is zero for this supported path; rental is current USD provider cost plus 30%, rounded up to the nearest cent. Quote lifetime is five minutes. Calls, messages, emergency services and carrier fees are separate from rental.

The order binds buyer, tenant, exact E.164 number, owning account, trunk, policy/hub versions and price. Purchase rechecks session/location/provider eligibility, inventory and price before holding wallet funds. A globally unique number lock prevents duplicate Twilio platform allocation. A durable one-use submission claim prevents a second POST after timeout or crash. No cross-provider fallback is performed.

Successful remote ownership confirmation records the PN SID, paid invoice and wallet purchase atomically. Held orders have no payable invoice, avoiding a second debit through generic invoice payment. Explicit provider validation/auth rejection returns the wallet hold; network/5xx/unreadable/mismatched results keep the hold and require reconciliation. A successful but locally unfinished order is reconciled using exact account/number/order-specific FriendlyName. Absence from a remote listing never automatically releases a hold or permits another purchase.

The API worker checks calendar-month renewals every minute, using UTC dates anchored to submission time. Charges have unique period/invoice records under an order lock. If the available wallet cannot fund renewal, the provider price exceeds the accepted monthly price, the user is inactive, or renewal is over 24 hours late, it requests immediate number release instead of charging a higher amount or silently accumulating catch-up debits. Disabling new purchase policy alone does not cancel existing leases. Disabling the integration/provider causes due leases to release rather than renew. Changed/missing account credentials move leases to operator review without further automatic charges.

Customers can release allocated numbers immediately; unused rental is not refunded. A release timeout becomes `release_unknown`, never an automatic repeat. Super admin can perform read-only reconciliation, or explicitly request release after a fresh remote ownership check. Monitor unknown, release_unknown, renewal_review and overdue rentals: provider recurring costs may continue until a release is confirmed. A crashed API has no active renewal worker, so production monitoring and funded provider accounts are required.

Allocation is recorded in `twilio_did_orders`, with independent unique number locks and charge periods. This does not silently replace the primary outbound caller ID, bypass caller-ID authorization, enable Twilio SIP termination, add customer SMS sending, or claim two-way media acceptance. The number is attached to the configured TK trunk; the actual inbound route and audio must be acceptance-tested. This release does not commission the earlier missing outbound Twilio calling adapter.

Tests use mocked provider responses and database boundaries; real Twilio purchase/release, MySQL concurrency and live inbound/audio acceptance require production or staging acceptance. Do not treat a successful image build as that acceptance. Existing pinned older installers can replace UI modules; deploy this checkout installer last after older integration installers.
