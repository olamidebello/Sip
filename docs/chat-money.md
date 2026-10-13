# Chat money deployment

After exact-head deployment CI passes:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-chat-money.sh
```

The chat composer dollar icon and conversation menu open Olamide Money with both the recipient and requested payer preselected. Choose Pay or Request after entering an amount. Opening either shortcut never sends funds. Payment requests require review of the recipient and amount before the existing Confirm payment form sends a transfer. Changed request details are rejected. Decline and cancel use the existing ownership-scoped backend.

Money includes a USD keypad, available internal balance, Pay, Request, request activity, transaction history, invoice checkout where configured, and profile/account navigation. Super admin Money navigation grants for users/groups are preserved; the shortcut is disabled when not granted or the selected contact has no email. Existing backend billing/tenant checks, nonnegative balances, transactional double-entry records and transfer idempotency remain enforced. Only existing funded internal balances can be transferred; this script creates no money or artificial balances.

The Ansible wrapper verifies source and invokes the existing CI-gated MySQL backup, build, additive migration, restart and health workflow. It migrates existing wallet_accounts, wallet_transfers, wallet_entries and wallet_requests schemas; no new schema is required for these entry points. It does not change SIP configuration or provider credentials.

Dwolla and Flutterwave credential verification does not currently enable deposits, linked-bank withdrawals or external transfers. Add money and Cash out remain disabled. Cards, direct deposits, savings yield, stocks, bitcoin, loans and tax filing are not implemented, and Olamide does not claim Cash App affiliation or full parity.

Acceptance: two same-tenant accounts, contact Pay and Request preselection, zero transfers on shortcut/review clicks, explicit confirmed request payment, mismatched request rejection, insufficient funds, retry idempotency, tenant/owner denial and revoked Money navigation.
