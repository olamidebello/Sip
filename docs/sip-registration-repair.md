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
