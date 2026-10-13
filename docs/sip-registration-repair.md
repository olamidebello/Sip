# SIP registration repair

After exact-commit deployment CI passes, run:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-sip-registration-repair.sh
```

The playbook deploys the validated API/web release, then invokes the backed-up local realm repair with authentication refresh. Canonical secrets must already configure kamailio_local; unexpected domains, missing encryption keys and non-generated accounts stop preflight. It repairs the previously observed Flowroute realm and rebuilds authentication digests for generated accounts already under sip.dobhrap.com. Preflight decrypts all matching existing credentials before writes. Private database/environment backups are created before apply. Suspended users/accounts remain excluded by the authentication view. Carrier credentials, passwords, subscriptions and switch policy are preserved.

The API briefly stops during repair and is restarted even on failure. Realm changes and local authentication refresh are separate atomic transactions; a later failure can leave the earlier committed realm repair in place. The script does not automatically restore backups. It synchronizes the canonical and saved Compose local-mode/realm settings and verifies HTTPS health, WSS connection, authenticated REGISTER and temporary-contact cleanup. Failure propagates to Ansible; web health alone is not reported as a registration fix.

Use a maintenance window; the probe uses an active account and is not proof every client can register. After success sign out/in on the phone and verify a two-user audio call. If it still fails, provide the full probe output and final Ansible recap. No ACL bypass, forced account activation or password reset is attempted.

## Automatic check and conditional repair

After successful deployment CI, run:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-sip-registration-check.sh
```

This installer first deploys the exact CI-approved release (including the normal database backup, migration and application restart), then checks WSS, authenticated REGISTER and temporary-contact cleanup. If registration passes, the realm/digest repair is skipped. Only a REGISTER 401 or 403 triggers the existing backed-up local subscriber repair. Its existing local-mode, public-host, generated-account and decryptability guards remain mandatory. A final live check must pass; an unsuccessful repair fails the playbook.

Transport, timeout, rate-limit, unavailable-account/probe-selection and other failures stop with diagnostic output. They do not trigger speculative switch restarts, disable policy or reset passwords. This is an operator-run check, not a recurring unattended service. Use a maintenance window because the initial deployment and conditional repair restart the API. The probe exercises one eligible account; a passing probe cannot fix a revoked browser session or establish two-way audio. No card, carrier or firewall configuration is changed.

## Switch retry delays and navigation

The browser preserves SIP 503 Retry-After as structured metadata and applies the same bounded cooldown used for HTTP throttling. Repeated reconnect/wake actions cannot bypass the cooldown. This is a retry correction, not proof an account policy or credential failure has been repaired. Primary navigation icons share a non-wrapping row with reduced mobile spacing, including Social after Money.
