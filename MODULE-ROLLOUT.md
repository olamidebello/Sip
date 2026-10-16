# Module-by-module rollout

The generated MODULE-AUDIT.md enumerates all API source modules, client sources, application feature entries and Kamailio inventory entries. Regenerate it with `python3 tools/audit_application_modules.py`. Its source references, tests and migration links do not establish live service acceptance. The GUI view is Administration → Overview & reports → Telecom feature catalog → Examine module evidence.

## Deployment

After this release is merged and its main-branch deployment workflow passes:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-module-rollout.sh
```

This checks that the source inventory is current, installs deployment prerequisites, preserves the payment encryption key, requires successful deployment CI for the exact release, backs up MySQL, builds API/web, applies all registered migrations, restarts API/web, checks HTTPS, verifies every registered schema component, and reports host/provider prerequisites. It does not install every Kamailio package or activate conflicting switch profiles. Existing Kamailio commissioning and native-client build procedures remain separate. A fresh host requires the existing `deployment/install-all.sh` base installation first.

## CDR archives

Super administrators can queue and download compressed CSV archives for their selected workspace, and configure one recurring archive schedule per workspace. Completed-day scheduled archives support intervals of 1–720 hours and lookback windows of 1–31 days. The queue uses persistent MySQL records, leases and a maximum of three attempts. Archive creation rechecks that the creating user is an active super administrator and that both the user's home tenant and selected tenant remain active.

Each archive is bounded to 50,000 rows and 20 MB of CSV input, with tenant filtering and a queue-time ingestion snapshot. It contains only call-detail records; secrets and message contents are excluded. Formula-like CSV values are neutralized for spreadsheet use. SHA-256 covers the compressed download bytes. The GUI exposes the checksum. Oversized exports fail with a specific limit code; request smaller date ranges.

Only 20 archive copies are retained per tenant. A schedule pauses when the limit is reached. Download and remove unneeded copies, then re-enable the schedule. Removing a copy does not delete original CDRs. Original-record retention, cold storage and full database backup restoration are separate capabilities and are not claimed by this archive module. An active scheduled job cannot be removed mid-run.

## Payment reconciliation

Paystack and Flutterwave attempts now share the same verification routine between customer requests and the background worker. It checks exact reference, amount, currency and successful provider status before updating the original invoice under a row lock. Retry state is durable and a database advisory lock serializes workers across API replicas. Disabling a gateway prevents new checkout but permits verification of already-started payments with its saved credentials. Do not rotate credentials until pending transactions are resolved. Unresolved payments older than seven days are flagged for manual merchant review and never automatically submitted as new charges.

## Other repair

Scheduled summary reports now support a super administrator's selected workspace while requiring the creator's home tenant and report tenant to remain active. Previously the worker incorrectly required these tenant IDs to be identical and could skip a valid schedule.

## Still requiring implementation or commissioning

The feature catalog remains explicit: commissions, dedicated invoice/email template editing, tax assessment, live dialog control, calling-card services and other missing modules are not marked implemented. Mailchimp, WHMCS, CRM connectors, fax/media engines, signing credentials and portability datasets require separate implementations or authorized external services. Native mobile/desktop device acceptance, real call audio and merchant sandbox purchases cannot be established by source inspection or schema migration alone. All remaining entries and their declared gaps are listed individually in MODULE-AUDIT.md.
