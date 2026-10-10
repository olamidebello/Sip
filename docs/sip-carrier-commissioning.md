# Local SIP account and carrier commissioning

The tenant super administrator first enables the tenant SIP domain in **Kamailio tenant SIP settings**. The application provisions new accounts automatically. To reconcile existing active users and digest credentials on the production host:

```bash
cd /opt/olamide/kamailio-staging
git fetch origin kamailio-rebuild
git switch --detach origin/kamailio-rebuild
ansible-playbook -i deploy/kamailio/local-inventory.ini deploy/kamailio/provision-sip-users.yml
```

The account playbook uses the production API container and its existing `SIP_CREDENTIAL_KEY`. It creates missing accounts, activates pending accounts for enabled tenants, syncs Kamailio digest credentials and reports totals. It does not print passwords. Disabled tenants and suspended accounts are left alone. An account being active in the database does not prove it can register from a device; test a real authenticated REGISTER.

Carrier routing requires a real PBX trunk host and transport, active carrier profile, enabled gateway mapping, tariff rates, a funded prepaid account, reviewed SIP and RTPengine files, and carrier authorization. The combined entry point is:

```bash
ansible-playbook -i deploy/kamailio/local-inventory.ini \
  deploy/kamailio/commission-carrier-and-users.yml \
  -e @/root/olamide-carrier/commission.yml
```

Use a root-only vars file with the values required by `carrier-prepaid.yml` and `production.yml`, including the real endpoint and paths to nonempty independent carrier and prepaid acceptance reports. Never put peering passwords or API keys in command arguments or Git. The carrier gate parses the reviewed switch configuration and refuses activation if synchronous authorization, call expiry, media handling or settlement callbacks are absent. The generated `prepare-core.yml` configuration deliberately rejects carrier calls, so it cannot be used as the reviewed carrier configuration.

The carrier playbook also runs a read-only database preflight inside the production API container. It requires an enabled tenant, matching active carrier profile and gateway, enabled trunk whose host matches the reviewed endpoint, current tariff rate, and an active SIP account with digest credentials. Passing this check does not prove carrier reachability, real-time cutoff, media or billing reconciliation; those require observed calls and independent acceptance evidence. The playbook will stop before touching SIP services when the preflight fails.

## Unattended local installation and audit

From the reviewed detached checkout on the Debian 12 server, run:

```sh
cd /opt/olamide/kamailio-staging
ansible-playbook -i deploy/kamailio/local-inventory.ini deploy/kamailio/unattended-production.yml
```

The playbook repairs missing packages, generates missing private OTP, email and SIP encryption keys without rotating valid ones, backs up the database, deploys the GUI/API, provisions accounts for enabled tenants and audits SIP and carrier readiness. It returns a failure when the measured host or database carrier path is blocked, after reporting the blockers. A sender domain and provider key must still be configured and tested for email delivery. A real carrier trunk, reviewed dispatch and prepaid expiry configuration, and observed carrier, media, settlement and reconciliation tests remain required for live commissioning. Do not treat a successful package installation or SIP account backfill as live carrier acceptance.

The migration now seeds a disabled Flowroute draft trunk and gateway for each tenant, and links a draft carrier profile when a super administrator exists. The suggested US East Virginia PoP is a placeholder to review against the Flowroute account, not an assigned route. Existing carrier profiles and gateway choices are preserved. In **Administration → Carrier providers**, the super administrator enters the Flowroute access and secret keys, optional SIP username and password if assigned, and the correct PoP. The unattended installer generates the private provider encryption key if needed. API credentials are encrypted at rest and are never returned by the GUI; SIP authentication values are stored for profile management but are not yet consumed by the live Kamailio configuration. Verify inventory access and perform the separate switch and call acceptance before enabling traffic.

If Kamailio or RTPengine is already running, `production.yml` refuses to replace the live configuration. Plan a maintenance window, backup and rollback before a controlled cutover. Successful package, database and socket checks are not call acceptance: verify outbound and inbound carrier calls, two-way media, call expiry, end-event charging, ledger balance, failure handling and statement reconciliation before marking the service commissioned.
