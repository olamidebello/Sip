# Build a monthly calling plan

Users open **Marketplace → Build a plan** or **Billing → Build a plan**. Add up to ten country rows and enter each country's projected daily minutes. The total daily projection may not exceed 1,440 whole minutes. An optional international example number estimates a particular destination network; an example is required for countries sharing a calling code, such as +1. Example numbers are used for pricing and are not validated as proof of country, ownership or reachability.

The server calculates **daily minutes × 30 days × current selling rate**, rounds each country's estimate up to USD cents, and sums it. Without an example number it selects the highest current listed selling rate under the country's calling code. Flowroute uses the same cost-plus-30% function as live billing. Example-number quotes use longest-prefix matching. Unknown destinations and unavailable rates cannot be purchased. This is an estimate: per-call minimums, billing increments, different networks, calling permissions and later rate changes affect actual usage charges.

The displayed quote lasts ten minutes. The server rechecks the usage, tenant, owner, live rates, accepted total and wallet shortfall at purchase. The client cannot set a selling rate or invoice price. A stable request ID and unique quote allocation prevent retry invoices.

The monthly plan is a **30-day prepaid budget**, with no extra subscription fee or unlimited-minute promise. It does not replace the account's subscription, unlock destinations, impose country restrictions or fix rates at the switch. Users with sufficient current wallet balance activate the budget without a second debit. Otherwise an invoice requests only the shortfall. Enabled Stripe, Paystack or Flutterwave invoice checkout supplies the external payment. Deployment does not enable unconfigured gateways or charge customers.

A persistent worker reconciles authoritative paid invoices and matching paid gateway attempts every 15 seconds. It locks invoice, plan and wallet, credits the exact funding amount once, records a unique funding ledger, and starts the 30-day planning period. Wallet-paid invoices cannot mint new funds. Browser redirects do not mark plans funded. Pending or unverified payments remain pending. Multiple app instances use the same database locks and unique ledger keys. A crash before commit rolls back both credit and ledger; later ticks retry.

Calling charges continue through the existing wallet reservation/settlement flow. Budgets share that wallet; money is not separately reserved per plan or country. There is no automatic recurring charge or forfeiture at period end. Funding transactions appear in the existing wallet history. After returning from checkout, users can refresh My custom calling plans; the worker activates verified payments independently of their browser.

## Deploy

```bash
ansible-pull \
  -U https://github.com/olamidebello/Sip.git \
  -C codex/marketplace-calling-plans \
  -d /opt/olamide-deploy-controller \
  -i localhost, -c local \
  deploy/ansible/marketplace-calling-plans.yml
```

The combined playbook installs the DID marketplace and plan builder on the SIP host. Each component backs up host-customized source and running API/web images, validates integrations and relevant tests, builds images, checks health, and restores source/images if promotion fails. Existing secret files, rates, service areas and gateway configuration remain in place. Additive tables remain after application rollback so funding audit records are retained.

Deployment logs are root-only under `/opt/olamide/backups/inhouse-marketplace-*/deploy.log` and `/opt/olamide/backups/calling-plan-builder-*/deploy.log`. A health check verifies the API, not a real financial transaction. Validate an authenticated quote, sandbox gateway payment and resulting wallet credit on the host before accepting live customer payments. The local tests use query-recording database doubles; live MySQL concurrency and carrier calls have not been exercised from this workspace.
