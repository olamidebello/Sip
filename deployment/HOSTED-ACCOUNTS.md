# DOBHRAP managed account bridge

`POST /api/integrations/hosted-account` is a dedicated service-token API. It does not use a platform administrator session and does not expose general user-management operations. `DOBHRAP_BRIDGE_TOKEN` must be an independently generated 64-character hex secret shared privately with the DOBHRAP application. The external installation UUID and owner/workspace identifiers form stable mappings in `hosted_accounts` and `hosted_account_tenants`.

Personal users receive an ordinary account and SIP identity. Organization owners receive a tenant administrator account in a separate PBX workspace; other users receive ordinary accounts and new extensions in that workspace. Extension numbering starts at 100. Existing account emails are rejected for manual review instead of being linked or overwritten. Repeating an external identity does not reset its password, change its role or create duplicate SIP accounts. A suspended remote workspace remains suspended.

Run on the existing SIP server after pulling this release:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main
ansible-playbook deployment/ansible/hosted-accounts.yml
```

This requires the established Compose deployment, protected environment files and working Docker/MySQL services. It acquires `/run/olamide-update.lock`, preserves/synchronizes the token in both environment files, writes `/root/dobhrap-sip-bridge-token` mode 0600, backs up the database, builds the API, runs bridge tests, migrates and restarts the API and web interface. Public health must work and unauthenticated bridge requests must return 401. If installation fails, the old API and web images is restored where possible; additive schema remains. The private backup path is reported. Database dumps contain private data and must stay root-only.

Copy the private token file to `/root/dobhrap-sip-bridge-token` on the DOBHRAP application host, then run that repository's `ansible/communications-oob.yml`. Never paste the token into a browser address, chat or shell argument. Do not regenerate it on either server independently. Changing or losing the external installation UUID creates a new namespace; preserve the source database and encryption key together.

Switch activation uses the existing `SIP_CREDENTIAL_KEY` and local Kamailio or configured remote switch provisioner. The bridge returns `awaiting_switch` until the switch acknowledges activation; it does not fabricate a working account. No paid plans, PSTN routes, DIDs, trunks or call credit are purchased by this endpoint. PBX extensions are provisioned records; the existing PBX runtime readiness checks still apply. The portal stays at `https://sip.dobhrap.com/` and uses its normal login and webphone.

This is provisioning, not SSO or identity lifecycle synchronization. Source-platform suspension or deletion does not independently revoke SIP credentials. Manage those accounts in the SIP administrator portal too. Do not grant PBX administrator access to individual accounts or automatically link by email.

Validation: `node --test services/api/hostedAccounts.test.js`, `node --check services/api/server.js`, and `ansible-playbook --syntax-check deployment/ansible/hosted-accounts.yml`.

Business names are read from the authenticated user’s own tenant by `/api/pbx/branding`. The PBX and phone-service headings use that name with a stable preset accent. The name is inserted as text, never HTML or a CSS value; another tenant cannot be selected through the branding request. Existing workspace names also receive this styling.
