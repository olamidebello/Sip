# Unattended Kamailio prepaid calling deployment

Run as root after pulling main:

```sh
cd /opt/olamide/repo
git fetch origin main
git merge --ff-only origin/main
bash deployment/deploy-kamailio-paid-calls.sh
```

The launcher uses a temporary isolated Ansible inventory/config, avoiding unrelated vault variables. It requires the Kamailio HTTPS carrier adapter already installed in this conversation and the recognized HTTP authentication/extension bridge configuration. It stages the paid route, validates the entire configuration with the server's Kamailio parser, creates a durable loopback settlement queue, builds/starts the billing API, migrates billing tables, cuts over validated SIP routes with rollback, and automatically commissions the saved Flowroute IP gateway within enabled adapter capacity. No new credentials are invented or prompted for.

The initial Kamailio route installation restarts Kamailio; deploy between calls. Unknown/custom routing or existing dialog/uac modules cause staging to stop for review. The installer requires the saved SIP credentials, eight-digit tech prefix, authorized outbound caller ID, and confirmed Flowroute IP allowlist. Missing account settings stop gateway commissioning with a specific error; the installed billing backend still refuses calls that lack prerequisites. The script does not buy DIDs, add wallet funds, invent prices, or enable subscriptions. Import and activate a Flowroute rate deck, use subscribed active users, and fund their USD wallets using existing administrator/provider workflows.

## Charging behavior

A paid call looks up the longest matching prefix in the active Flowroute rate deck and snapshots its marked-up price and first/subsequent billing intervals. Destination fraud blocks, subscription/access checks, active gateway status and tenant concurrency limits are enforced before a call is routed. A stable SIP Call-ID/from-tag key makes retransmitted authorization requests idempotent. Tenant-wide database locking serializes reservations; wallet balance is locked before debit.

The API reserves credit for up to one hour, reduced in whole minutes to what the wallet can afford. It denies calls without enough credit for one minute. Kamailio's dialog module applies that budget and sends BYEs at timeout. It applies the saved caller ID, strips subscriber authentication headers before carrier relay, prepends the Flowroute IP tech prefix, and keeps existing RTP/reply handling. Only authorized server responses enter the paid route. Existing same-tenant extension calls retain their local route and do not reserve paid-call credit.

Dialog start/end/failure events are authenticated and committed to a local SQLite WAL queue before acknowledgement. The queue retries delivery to the private billing API. MySQL settlement records events idempotently, accommodates end-before-start delivery, rounds the final interval charge to USD cents once, and refunds unused reservation credit exactly once. Failed unanswered calls refund their reservation. Missing, conflicting, or over-budget events retain reservations for reconciliation rather than inventing a duration or issuing unsafe refunds.

## Accounting and acceptance

Billing records are in `pstn_calls`, `pstn_call_events`, and `pstn_wallet_entries`. The call ledger is separate from the existing person-to-person transfer ledger, so this change does not yet add call charges to the end-user wallet history screen or the general imported-CDR screen. Charges and refunds update the same USD wallet balances transactionally. Unsettled reservations count against concurrency until settlement or an audited manual reconciliation. There is no automatic guess-and-refund job for calls whose events were lost during a switch/disk failure.

Unit tests cover rate rounding, subscription denial, invalid event rejection, repeated/out-of-order settlement, excess-duration quarantine, durable queue deduplication, and recognized configuration patching. Actual Kamailio parsing is checked on deployment. Live SIP transport/media, BYE budget enforcement, carrier billing, and MySQL contention need server acceptance testing: place one funded call, end it, verify the call ledger charge/refund and two-way audio; confirm an unsubscribed account and insufficient-credit account are denied. Do not treat script completion as evidence of a successful carrier call or 500-call load capacity.

The queue stores events in `/etc/olamide/billing-events.sqlite`; include it and the MySQL billing tables in backups. Do not delete pending events or reservations. API downtime delays settlement but does not grant additional credit. A Kamailio restart clears its carrier htable; rerun the commissioning command to reactivate the gateway before paid calls resume. Existing certificates/tokens are preserved.
