# SmoothDID in-house rentals and geographic availability

SmoothDID groups the supplied Ilorin blocks `203150` through `203154`: `+2342031500000`–`+2342031549999`, up to 50,000 numbers. The existing globally unique `inhouse_dids.number_e164` inventory is reused. Existing owned/reserved/disabled numbers are never reassigned or overwritten. Existing owned numbers are not silently converted to new paid rentals. Initialization is restricted to tenants with recorded `did_requested_blocks` ownership and to super administrators.

## Administration

Open **Administrator → SmoothDID management**. Each block has:

- A default new-rental price of **300 USD cents per calendar month**, zero setup fee; subsequent price edits affect new rentals only. Existing rentals retain their contracted monthly price.
- A sales/renewal switch; newly initialized blocks start paused until allowed geofences are configured. No geographic centers or radii are invented.
- Multiple named, individually enabled radius areas. Device position plus reported uncertainty must fit inside at least one enabled circle. Location age/uncertainty limits and allowed user-group membership are checked on purchase.
- Permitted clearing houses (`hp-inc`, `flowroute`, `didww`) at group level, with a subset selectable for each area. New-call eligibility uses the current location lease and actual authorized caller DID, not the location used at purchase.
- Separate voice and SMS readiness flags and a routing verification reference. These record an administrator's verification; saving them does not provision an external carrier.
- Recent allocations, owners, paid-through dates and suspend/resume controls. Suspension keeps the unique number allocated; resume requires an unexpired paid rental.

The five group records initially permit HP Inc as a policy choice, but HP termination remains uncommissioned. A group geofence, paid rental and readiness flag cannot override that block. HP also requires its existing exact caller DID allowlist, Nigeria `234` destination eligibility, trunk credentials, approved rates and a commissioned switch adapter. Existing authorized carrier identity controls choose the actual carrier; this feature does not silently switch a customer's trunk or grant external caller-ID authorization.

## Purchase and rental

Open **Invoices & payments → SmoothDID — in-house Nigerian numbers**. Search by prefix and block. Only eligible groups expose numbers. Confirm the displayed price and service readiness, then rent using available USD wallet balance. Allocation, wallet debit, paid invoice, wallet purchase record and rental period commit in one transaction. Global unique inventory, row locks and idempotency keys prevent a DID being allocated twice or a retry charging twice.

Users see their paid-through dates, contracted price and channel readiness, can renew one calendar month, and can explicitly opt into monthly wallet auto renewal. Automatic renewal retains the number at the contracted price; geographic eligibility is independently checked when service is used. Insufficient funds, disabled renewals or suspended users stop renewal. Expired rentals are blocked immediately by runtime checks and suspended by the maintenance worker. They are **not** automatically resold. No payout or cash-out path is added.

**Check current clearing houses** evaluates the assigned user's current lease. A result is eligibility, not a promise of carrier capacity, destination pricing, credit, media connectivity or external trunk readiness. Current country/interconnect rate policies still apply independently.

## Runtime integration and deployment limits

The preserving installer adds checks to PSTN reservation for the selected caller DID, inbound routing resolution and shared subscriber voice/SMS delivery lookup. Outbound checks require the SIP call's session-bound `locationProof`; inbound recipient checks use the latest fresh policy-bound active-session lease, since an incoming carrier request does not carry the recipient's device proof. Existing location rules produce leases even when only a SmoothDID group fence is enabled. Changing group versions invalidates old policy hashes; refresh device location after edits. GPS/IP source rules are inherited; VPN is not required.

Legacy public in-house listing/reservation excludes SmoothDID-managed inventory, preventing an invoice-only reservation from bypassing geographic wallet purchase. Unknown source layouts stop deployment before the next installer writes files. Backups restore source/images on failure; additive tables and explicit inventory initialization remain.

This deploys purchase/allocation and policy controls. Live inbound carrier delivery, SMS capabilities, outbound caller-ID authorization, actual HP termination, end-to-end media and device proof forwarding require host/carrier verification. Existing server-local handlers must use the integrated lookup/reservation paths; independent carrier handlers are not invented or replaced.

Tests cover all 50,000 unique numbers, calendar dates, price expectations, duplicate requests, assigned-number denial, transaction rollback, insufficient credit, group membership, fresh location/uncertainty, zone-specific clearing houses, channel readiness, role restrictions and GUI requests. SQL behavior and simultaneous purchases must also be validated against the host's MySQL deployment; local tests use a query-recording database double, not a production database.

## Marketplace entry and subscription coexistence

**Marketplace → Shop products & services → Buy in-house DID** opens the same live number catalog and wallet checkout as Billing. Active subscribers may purchase additional paid numbers. The included-number worker excludes all paid rental records and never cancels or zeroes a rental. Paid checkout does not require the Nigeria SMS verification used for the separate free included-number benefit. Existing billing access, user-group and fresh-location requirements still apply.

Only recorded `allocated_ncc` blocks can be initialized or newly sold. Checkout also rejects included assignments and release holds before accessing the wallet. Listings exclude those records and existing rentals. Existing prices and service areas are preserved; administrators must configure a positive price and enable their eligible groups before numbers become purchasable. Provisioning a number alone does not enable group sales.

Deploy with `ansible-pull -U https://github.com/olamidebello/Sip.git -C codex/marketplace-calling-plans -d /opt/olamide-deploy-controller -i localhost, -c local deploy/ansible/inhouse-marketplace.yml`. The installer preserves existing integrations and configuration; source and running images roll back on deployment failure. No customer is charged by deployment. A real authenticated checkout and host MySQL concurrency test remain host validation steps.
