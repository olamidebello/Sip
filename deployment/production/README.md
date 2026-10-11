# Unattended production deployment

From a controller with Python 3, Ansible, OpenSSH, `flock`, `curl` and `jq`:

```bash
bash deployment/deploy-production.sh /secure/inventory.ini /secure/production.yml
```

No prompts, manual password entries, broad firewall resets or generated files in Git.
The default selects the latest successful **push** run of the repository's deployment
validation workflow. This may be older than the latest main commit while CI is pending.
A third argument explicitly selects a tested 40-character SHA. The remote helper verifies
that release belongs to main and advances the existing checkout. Copy the inventory and
private configuration examples here, complete them, and protect configuration with
mode 0600 or Ansible Vault. For encrypted configuration use an already configured
`ANSIBLE_VAULT_PASSWORD_FILE`; unattended runs do not ask for a vault password.

## Required before starting

- Authorized root SSH or passwordless sudo with verified host keys; Debian 12 and a
  CPU compatible with the selected MySQL image. Do not disable SSH host verification.
- Public domain DNS pointing to the verified server IP. Permit inbound TCP 80/443;
  TURN requires TCP/UDP 3478 and UDP 49160–49260. The reviewed Kamailio/RTPengine profile
  defines its SIP/media ranges and carrier ACLs. Provider firewalls remain your inputs.
- An explicit drained maintenance window (`production_maintenance_approved: true`).
- An executable acceptance probe on the server and `production_acceptance_argv`.
  The probe must return nonzero on a failure. It must test authenticated registration,
  an actual user-to-user call, two-way audio, unauthenticated rejection and PSTN plan
  restrictions, with private test-account credentials. An HTTP 200 is insufficient.
- A reviewed off-host encrypted backup uploader, expressed as
  `production_backup_argv`. The deployment appends the backup filename as the final
  argument. No cloud login is fabricated. Backups contain sensitive application data.
  `production_require_offsite_backup` defaults to true. Setting it false intentionally
  chooses local backups only and lowers disaster recovery protection.
- `initial_admin_email` for first installation. Existing accounts/admin roles and
  database credentials are preserved. An existing database without a super admin fails
  for manual account review; the script does not silently elevate a regular user.

For a **fresh calling host**, set `commission_same_server` and `commission_sip_accounts`
to true, configure the same inventory alias in `olamide` and `switch_nodes`, and supply
all reviewed values from `deploy/ansible/same-server.inventory.example.yml` plus
`sip_registration_config_source`. These include real carrier networks, Docker bridge
addresses, media ranges, Kamailio module/package lists and the RTPengine configuration.
The existing roles perform their own syntax/runtime validation and component rollback.
The production orchestrator excludes FreeSWITCH/PBX profile enablement.
For an existing commissioned host, leave commissioning false; the final checks still
require WSS and `SIP_PROVISION_MODE=kamailio_local` by default.

## What runs automatically

1. Validate configuration, public IP, DNS, maintenance approval, inventory and probe.
2. Install required host tools/Docker if missing; enable security updates without
   automatic reboots; check the MySQL virtual CPU before changing data.
3. Stop/disable the legacy Git-update timer and wait for its in-flight update. This
   production workflow becomes the release entry point; it does not schedule updates.
4. Preserve existing private environment values; generate missing strong database,
   SIP, provider, payment, OTP, runner, webhook and TURN secrets. Conflicting existing
   database/encryption identities stop the rollout rather than replace keys.
5. Back up the existing MySQL database to a private gzip file and invoke your off-host
   uploader before migrations. A first install also backs up the newly initialized DB.
6. Fetch the immutable release, build API/GUI/TURN, and retain the existing MySQL binary
   and running app images for rollback. Start database/TURN, wait for readiness, run
   additive migrations explicitly, then start API and GUI.
7. Create one initial super admin only in an empty database. Its generated credential
   is kept in `/etc/olamide/initial-admin.json`, mode 0600, and must be changed at login.
   Existing administrators and their passwords are untouched; this file is not a new
   password for an existing administrator.
8. Check DB queries, API, publicly trusted HTTPS, expected public release SHA and GUI. Install a boot unit using
   the recorded images with database readiness, without rebuilding at every boot.
9. Commission explicitly selected SIP/native profiles, then run WSS, real-call and
   optional real-device acceptance. Write `/opt/olamide/production-readiness.json`
   only after these checks pass for this release.

Existing Docker volumes are retained. The script never runs `down -v`, deletes the
application database, automatically restores old database data over newer writes,
or prunes the retained rollback images. Protect and retain backups according to your
operator policy; replication, failover and a restore rehearsal remain separate tasks.
Base-image/package versions are not a complete reproducible supply-chain policy;
recorded local images protect app rollback, while production image-digest pinning and
an organization-approved registry remain operator release controls.

## Failure and rollback boundaries

The application helper takes the same host lock as the old updater. It restores the
previous checkout, environment and retained running application images if build,
migration, initial administrator or public readiness fails. A first-install failure
stops application services and preserves its DB/credentials for diagnosis. Failed
migrations remain additive; the database is not reverted automatically. The legacy
update timer remains disabled. Do not run parallel deployers from other controllers.

SIP and push components use their existing component rollback. A failed optional
profile, package build or final call probe stops the playbook with nonzero exit and
leaves the base application installed for diagnosis. There is no cross-component
transaction or automatic restoration of a whole server. Readiness is explicitly
pending until all configured acceptance probes pass. The orchestrator invalidates the prior acceptance report before rollout; only final
acceptance changes the pending report to accepted for the new release SHA.

## Native production boundary

Enable `enable_native_push`, Android/iOS build flags and provide the private fields in
`deployment/native-push/config.example.yml`. Firebase provisioning uses your existing
Google authorization and project. Apple APNs provider keys and authorized Mac/Xcode
signing are supplied by the operator. Set `production_require_native: true` to require
a physical-device acceptance probe. Android release signing/store distribution is
not automated by the existing debug APK build profile.

The repository still uses SIP.js/WKWebView for media. Reliable suspended/terminated
**iOS** calling requires a native SIP/media engine integrated with CallKit's audio
session. This script cannot create that engine or certify it through a boolean.
iOS production remains blocked unless `ios_native_media_verified` records completed
native-engine/device acceptance. CallKit UI is available, but the complete WhatsApp
application experience, E2EE interoperability, app-store releases and all native
background-call guarantees are not implemented. This automation deploys and verifies
configured, implemented profiles; it is not a blanket production certification.

## Running locally on the server

If remote SSH is unavailable from your controller, use an inventory with
`ansible_connection=local` and the same host alias in both groups. Run as root from an
updated repository with Ansible installed. The same private inputs and acceptance
requirements apply. Do not use placeholder credentials or acceptance commands that
always return zero just to obtain a readiness report.
