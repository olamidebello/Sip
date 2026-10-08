# Olamide user, administrator and operations guide

This guide describes the controls implemented in the app. A saved configuration is not proof that a carrier, router or external service accepted it. Review job status and live service checks before using a change in production.

## Roles and access

| Role or grant | What it permits |
| --- | --- |
| User | Sign in, use enabled communications features, manage personal dashboard views and open support tickets. |
| Tenant administrator | Manage users, groups, tenant settings and shared dashboard views for the selected tenant. |
| Super administrator | Select tenants; control registration policy, WSS discovery targets, shared fleet settings and access grants. |
| Fleet view grant | Read server/device inventory, configuration versions, monitoring, reports and credential-free dumps. |
| Fleet manage grant | Add, edit, retire and reorder inventory; save versioned device configuration and firewall policy. |
| Fleet deploy grant | Manage plus approved switch health, install, upgrade and firewall jobs and schedules. |

A super administrator assigns a fleet grant to a user or group in the selected tenant. Fleet inventory is shared infrastructure; granting access exposes the whole fleet, not just that tenant's calls. Review membership before granting access. Tenant dashboards, personal dashboard views and tenant user records remain scoped to their tenant.

## User training

1. Register with an email address allowed by the current registration policy. Enter the six-digit email code within ten minutes. If signup is closed, request an account from your tenant administrator.
2. Sign in, open **Account & security**, change temporary credentials, and add a passkey if your device supports one.
3. Open **Dialer**. Check the WSS URL and SIP identity. Healthy WSS discovery can select a regional target on sign-in; the URL can be changed before connecting. Calling requires an activated switch account and permitted route.
4. Use **Account messages**, **Text messages**, **Meetings** and **Plans, numbers & billing** according to your group's enabled features. A number request or invoice is not carrier activation.
5. Open **Dashboard → My dashboard views** to save named personal layouts. Drag tiles or use the arrow buttons to order them. In **My background**, choose a built-in theme or two dark custom colors and a gradient angle. Select **Use** to activate a view, or **Use default layout** to return to tenant defaults. Administrators may lock personal overrides.
6. Open **Support tickets**, choose the relevant category and describe the symptom, time, affected account and what you tried. Never include SIP passwords, API keys, OTP codes or Vault secrets.

## Tenant administrator training

1. Select the intended tenant. In **Users & groups**, add users, assign group memberships, and review effective feature access.
2. In **Dashboard defaults**, arrange tiles and choose whether members can override the layout. Create a named **Selected tenant** view from the dashboard to publish an additional preset.
3. Configure the tenant's SIP WSS URL, SIP profiles, calling policy, billing/catalog controls and messaging numbers. Verify each upstream carrier integration separately.
4. Use **API capacity** for the existing single-host Compose API replica request (1–4). Review desired versus observed replicas and the action history. This does not cluster MySQL, media, Caddy or TURN.
5. Review **Reports**, call records, security events and support tickets. Escalate switch or network changes to a super administrator or granted fleet operator.

## Super administrator fleet training

1. On a persistent Debian/Ubuntu controller, run `deployment/controller-bootstrap.sh`. On Windows, `deployment/install-class5.bat` invokes WSL. Provide the DNS name, public IPv4 address, SSH access, SignalWire token and Vault password. The script generates private application secrets, installs the app and switch, and installs a systemd runner timer when supported.
2. Keep the controller online with Ansible Vault, the private runner token and SSH keys. Never enter these credentials into the browser. Check `systemctl status olamide-fleet-runner.timer` and `journalctl -u olamide-fleet-runner.service`.
3. Open **Fleet operations → Server and network operations**. Add a Debian 12 switch with the reviewed management IPv4 address, SSH user and port. Register SSH host keys, passwordless sudo, DNS and a trusted WSS certificate before queuing installation.
4. Use **Health**, **Install** or **Upgrade** for supported switch hosts. A job is queued, leased by the controller, run one host at a time and recorded in MySQL. Watch job history, events, switch version and last check. An active job prevents changing or retiring its server inventory.
5. Drag server or device cards to reorder them. Move up/down buttons offer the same function. **Dump server inventory** exports credential-free JSON. A retired server is disabled and its schedules are paused; historical jobs remain.
6. Add router, switch, firewall, load balancer or server devices. Edit structured JSON (`hostname`, `description`, `vlans`, `interfaces`, `routes`), or drop a JSON file onto the editor. Every save creates a numbered revision. View or export a prior version and dump the current desired configuration. These device drafts do not run vendor commands. Link a supported Linux switch to use its install job.
7. In **Fleet access grants**, choose a user or group and assign view, manage or deploy. Revoke access when no longer needed. The API checks the grant on every request; hiding a button is only a UI convenience.
8. In **Dedicated switch firewall policy**, save SSH and carrier SIP source CIDRs, review the preview and queue **Apply reviewed policy**. This works only on a separate Debian switch. The runner refuses an app/Docker co-host and verifies its own SSH source lies inside an allowed network. Keep console or out-of-band access and test carrier reachability after application.
9. In **Registration and switch discovery**, close public signup or set allowed lowercase email domains. Existing verified accounts keep access. Add WSS targets linked to healthy switch nodes; the discovery endpoint selects by region and weight and removes stale or unhealthy nodes from selection. It supplies a browser connection URL; it is not SIP 3xx redirection or a call-routing failover engine.
10. Configure health and upgrade intervals per switch. Pause a schedule before maintenance. Reports show configured capacity and recorded health checks; they do not measure concurrent call throughput.

## Technical reference

- Migrations run at API startup and via `services/api/migrate.js`. Fleet tables include `deployment_nodes`, `deployment_jobs`, `deployment_checks`, `deployment_schedules`, `deployment_events`, `fleet_devices`, `fleet_config_revisions`, `fleet_access_grants`, `fleet_firewall_policies` and audit tables. Registration, redirector and named dashboard views have separate tables.
- The browser uses same-origin authenticated `/api/admin/servers/*`, `/api/admin/operations/*` and `/api/dashboard/views/*` routes. The controller alone uses `/api/integrations/deployment/*` with `DEPLOY_RUNNER_TOKEN`. Do not expose the token to browser code.
- The runner accepts only `health`, `install`, `upgrade` and `firewall` jobs. It uses strict SSH host key checking, passwordless sudo and an Ansible Vault password file on the controller. It renews a 20-minute job lease while running. A failed or expired job is retried at most three times.
- A dedicated firewall job applies `deploy/ansible/firewall.yml` with nftables. SSH CIDRs and carrier CIDRs are bounded and validated. The initial app/switch co-host keeps host firewall management disabled because Docker networking needs separate review.
- WSS discovery resolves only enabled targets linked to healthy, recently checked nodes. A missing target leaves the configured tenant WSS URL in place. Verify certificates, DNS, SIP registration, inbound and outbound calls and media on every target independently.
- Named dashboard views are tenant-scoped or personal. A tenant administrator can publish shared views; user selections are stored per user and tenant. The existing tenant default and personal layout continue to work.

## Practice exercises

1. Create a personal view, activate it, switch to the default and confirm another tenant cannot see it.
2. Grant **view** to a test group. Confirm members can export a device revision and cannot save configuration or queue jobs. Increase to **manage**, retest, then revoke.
3. Add a disabled test device, save two structured revisions and download each. Reorder it with drag and drop and keyboard move buttons, then retire it.
4. Close public registration, attempt a test signup and confirm it is rejected. Reopen signup with a test domain, complete email verification, then restore policy.
5. Add a disabled WSS target, verify no client chooses it, enable it after a healthy node check, and test discovery. Do not treat this as a SIP call failover test.
6. On a lab dedicated switch, save a firewall policy that contains the controller's current SSH source CIDR. Queue apply, inspect the controller journal and test a new SSH connection. Keep console recovery available.

## Troubleshooting and support

- **Runner configured but jobs remain pending:** `DEPLOY_RUNNER_TOKEN` means credentials exist; verify the timer is active and can reach the public API. WSL without active systemd needs a persistent Linux controller.
- **Health unreachable:** verify DNS/IP, SSH host key, SSH port, user, key and `sudo -n`. The GUI never sends an SSH password.
- **Installation fails:** inspect the private controller journal, Vault password, SignalWire package access, Debian 12 requirements, trusted certificate and Ansible output. The API stores only a short result summary.
- **No WSS target:** a target must be enabled, its linked switch must be healthy and its check must be fresh. Otherwise use the tenant-configured WSS URL.
- **Firewall job rejected:** ensure a dedicated switch, enabled policy and controller SSH source within the saved SSH CIDRs. Use console recovery if network access was lost after another system changed rules.
- **Dashboard view unavailable:** check selected tenant, role, feature tiles and tenant override policy.
- **Support request:** include the job ID, node name, timestamp, sanitized error summary and steps to reproduce. Never attach secrets or raw private configuration.

## Current implementation boundary

The fleet runner provisions FreeSWITCH and nftables on supported Debian nodes. Other network device kinds provide inventory, structured desired configuration, revisions and exports; vendor adapters, live configuration collection, telemetry agents and device-specific apply/rollback are not implemented. The Compose capacity action scales API processes on one host; it is not a distributed application or database cluster. Production telecom use requires independent failover, security and call-path acceptance testing.
