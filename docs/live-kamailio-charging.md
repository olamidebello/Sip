# Live Kamailio calls and prepaid charging

The existing paid-call backend uses authenticated SIP identities, active subscriptions, an active Flowroute IP gateway/rate deck and USD wallet credit. It reserves credit in MySQL, sets a server-calculated dialog timeout, sends switch events to a local durable settlement queue, and refunds unused reservation on settlement. Missing prerequisites reject paid calls. Internal SIP calls remain separate.

Run in a maintenance window: initial route installation restarts Kamailio and may interrupt calls.

```sh
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-kamailio-paid-calls.sh
```

The standalone installer now requires exact-release CI approval, holds the shared deployment lock, explicitly applies the additive billing schema before cutover, validates the staged whole Kamailio configuration and restores the previous route if cutover checks fail. It only patches a recognized HTTP-bridge configuration; an unrecognized live configuration stops for review. It does not use the optional native ASTPP database or install another SIP switch.

Before traffic acceptance, test a funded subscribed account: answered call, rejected/unanswered call, two-way audio, DTMF, credit timeout and duplicate/out-of-order billing events. Review `pstn_calls`, `pstn_call_events` and `pstn_wallet_entries` for reservation and settlement. Installation/RPC success alone does not establish call or billing acceptance. Interrupted dialogs and settlement conflicts require reconciliation; do not release reservations based only on age.
