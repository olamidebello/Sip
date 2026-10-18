# Account balances and wallet top-ups

Money, Billing and Calls show the account balance and available balance with a Top Up button. Account balance includes the amount reserved for active calls; available balance excludes it. A single wallet snapshot reads both values. The Money and Billing views show payment history.

Top Up opens a USD amount dialog. Buy Now creates a persistent request and redirects to Stripe hosted card checkout. No card data enters this application. The browser cannot mark a payment paid or grant credit. A canceled or unpaid checkout leaves the wallet unchanged.

## Deploy on the existing SIP server

Apply the release commit without discarding local commits, then run:

```bash
cd /opt/olamide/repo
sudo ansible-playbook -i localhost, -c local deployment/ansible/wallet-topups.yml
```

The playbook preserves existing payment encryption keys, initializes a key only when no encrypted gateways exist, rebuilds API and GUI, applies additive database migrations, and checks API health and the four funding tables. It explicitly preserves the running container’s Compose configuration files plus the saved caller-ID, location, and country overrides, validates country resources before replacing the API, preserves volumes, and does not change Kamailio configuration.

In Administration > Payments & wallets > Wallet top-ups:

1. Open Stripe settings. Save the merchant's live secret API key and webhook signing secret through the existing encrypted credential form, and enable the gateway.
2. In Stripe, register the webhook URL displayed by the GUI for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`.
3. Enable top-ups, set the minimum and maximum USD amount, and save. The default limits are $1–$1,000; supported limits are $0.50–$10,000. Controls apply to the selected workspace. Only super administrators can change the policy or inspect all top-up payments in that workspace.

Use only live payments for spendable balances. Test-mode gateways cannot enable wallet funding. Disabling funding or the gateway stops new checkouts; keep the original encrypted credentials so already completed payments can still reconcile. Rotating merchant accounts/keys while payments are pending requires resolving those payments with their original account first.

## Database and confirmation

Startup creates `wallet_funding_policy`, `wallet_topups`, `wallet_topup_credits`, and `wallet_topup_events`. All tables use InnoDB. The credit ledger has one row per top-up and a unique Stripe session. Amounts are integer USD cents. The signed webhook validates live mode, payment status, session, tenant, user, currency, and amount. Balance, ledger, and paid status commit together under row locks. Repeated events and concurrent rechecks cannot credit the same top-up twice.

The return page asks the backend to retrieve the session from Stripe; its URL alone never proves payment. Users can check their own pending payments. Super administrators can recheck payments in their selected workspace. A background worker checks pending sessions every minute if the browser closes or webhook delivery is delayed. The worker rotates through pending sessions from the past seven days. Older unresolved payments remain visible for administrative review.

A timeout retains the original request ID. Retrying the same request reuses the persisted amount and Stripe idempotency key. Do not change the amount to retry an uncertain payment. Resume or check the existing payment instead. Refunded/charged-back funds and cash withdrawals require separate operational workflows; this release never automatically debits a wallet for a refund.

## Validation

Run `npm test` in services/api and apps/web, then `npm run build` in apps/web. `walletFunding.test.js` exercises payment matching, signature verification, failed/unpaid payments, duplicate delivery, rollback, ownership, request retries, and admin policy revisions. `walletTopups.test.js` exercises balances, checkout submission, retry persistence, server verification on return, and session changes. An optional database integration test runs against `TEST_MYSQL_URL`; use an isolated test database, never production.


## Manual credits and location history

Super administrators can use Payments & wallets > Manual user credits to search active users in the selected workspace, enter USD $0.01–$10,000 and a reason, confirm the target email/amount, and add funds. No payment processor is charged. The `wallet_admin_credits` ledger, security event and wallet balance commit together. Stable request IDs protect retries, and the report records the actor, target, reason and before/after balances. Refresh and Older credits load the report; Export displayed credits downloads only the loaded rows. End users see administrative credits in wallet activity.

Settings > Location history opens a user's own report without requiring billing access. Successful existing service heartbeat leases are sampled once per source/session/minute into `user_location_history`. No new background GPS permission is requested by this feature. Record current location explicitly requests device permission and records a fresh device-reported position. GPS and IP positions are estimates, not verification of physical presence. Locations from before this deployment cannot be reconstructed. No raw IP address, session token or SIP location proof is included in history.

Super administrators can use Captured user locations to search a user by name/email, filter by user, UTC dates or source, page older rows, open coordinate map links and export the currently displayed rows. `location_history_policy` controls collection and retention (default enabled, 90 days; allowed 1–365). Disabled collection stops new history but leaves active geofence enforcement unchanged. Reports exclude expired records immediately; the retention worker deletes them in bounded batches every five minutes. Users may delete their own saved history. Location-report controls do not change the existing country resource or service location authorization.

Redeploy with the same wallet-topups playbook. It tests the new safeguards, creates the three additive tables, preserves the country/location/caller-ID runtime overrides, and verifies all seven funding/history tables before reporting success.
