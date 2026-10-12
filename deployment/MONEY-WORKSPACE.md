# Messaging and Money workspace

After sign-in, users land in Chats and their assigned SIP session registers
without entering a SIP password. SIP remains managed by the existing automatic
registration controller while navigating. Reconnection uses its existing backoff,
network/visibility hooks, and SIP.js keepalive. Browser suspension or closing the
page can stop incoming calls; native background delivery requires native push.

The bottom navigation includes Chats, Updates (tenant announcements), Meetings,
Calls, and Money ($). Conversation calling uses the same contact SIP handler.
Search, messages, replies, edits, reactions, read receipts, contacts, block,
mute/archive, presence, meetings, and call controls retain existing integrations.
This is an Olamide interface inspired by familiar messaging/payment layouts;
it does not implement all WhatsApp services (such as E2EE, status stories,
group chats) or all Cash App products (banking, card issuance, investing, crypto).

Money is visible only with tenant/group billing permission. It includes a USD
keypad, internal transfers, persistent requests, request settlement, cancellation,
declining, transaction activity, account identity, and invoice checkout. Requests
are tenant-scoped and duplicate submissions use UUID idempotency keys. Paying
one validates the payer, recipient, amount and state under a transaction; request
status, both balances, and double-entry ledger rows commit together. Retries of
an already committed transfer cannot debit twice. Internal transfers require an
existing available balance; no money is created by the UI.

The wallet_requests table is created idempotently by the existing wallet migration.
The API /api/wallet/capabilities exposes only provider availability and mode, never
credentials. Stripe invoice checkout is available only with the existing encrypted
tenant gateway configuration. Test checkout is explicitly labeled. Signed webhook
reconciliation remains the sole confirmation of invoice payment.

Wallet deposits and cash-out are disabled with reasons because dedicated funding
and payout integrations are not implemented. Stripe invoice checkout does not
fund a wallet, and paying an invoice does not automatically activate calling.

Deployment on the server:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main && bash deployment/deploy-user-login.sh
```

The isolated runner rebuilds API and web and applies the API migration through
Compose. It checks API health and the public SIP WebSocket handshake. Verify
login, automatic SIP connection, a two-user internal call, Money navigation,
request creation/cancellation, and Stripe test invoice checkout before enabling
live checkout. Existing encryption keys and gateway settings must be preserved.
