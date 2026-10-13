# Local subscriber domain repair

An observed probe connected over WSS but returned `403 Account unavailable`. Its active account was stored under `us-east-va.sip.flowroute.com` and had one eligible auth-view row. A carrier realm on a generated local subscriber points to a mismatch with the local switch's authentication lookup. It does not prove the switch's configuration; successful authenticated REGISTER is the final acceptance check.

After exact-commit deployment CI passes:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-messenger-features.sh &&
python3 tools/repair_local_sip_domain.py --from-domain us-east-va.sip.flowroute.com --to-domain sip.dobhrap.com --apply
```

Omit `--apply` for an account/credential preflight only. The API image must contain `repairSipDomain.js`, so deploy before running the host tool. It requires existing `kamailio_local` mode and a target matching the Compose `DOMAIN` host (Compose derives `PUBLIC_ORIGIN=https://${DOMAIN}`). It refuses unexpected environment domains, non-generated subscriber identities and credentials that cannot be decrypted with the existing key.

Before writes it creates private environment and MySQL backups under `/opt/olamide/backups/sip-domain-*`. The repair preflights every matching credential, then updates account domains and digests atomically. It preserves usernames, encrypted passwords, statuses, memberships, subscriptions and carrier profiles. Suspended accounts stay suspended and excluded by the authentication view. Both the canonical environment and a distinct saved compose .env are updated so future subscribers use the local realm. The API is briefly stopped while a one-off repair container runs, preventing its provisioning worker from racing the repair, then recreated even if repair fails; Kamailio configuration is not modified or restarted.

The probe creates a temporary contact, removes it on success and otherwise expires it after 60 seconds. Run while the selected probe user is not on a call. After success clients must sign out and sign in again to obtain the corrected SIP identity. Existing contact records are not rewritten or forcibly evicted; allow old registrations to expire. If the final probe still fails, collect its result and inspect the switch's actual domain and private bridge lookup policy before changing routing.

The host guard reads `DOMAIN`, including quoted values and the default HTTPS port. A standalone PUBLIC_ORIGIN entry in the secrets file is neither required nor used by this Compose deployment.

Preflight and apply both use fresh one-off API containers with the canonical environment; they do not inherit a stale running API container mode. After canonical local-mode validation, the saved Compose environment is also synchronized to local mode so later deployments do not reintroduce remote mode.
