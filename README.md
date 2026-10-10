Warning: truncated output (original token count: 30620)
Total output lines: 833

# Olamide SIP

Olamide is a development browser softphone with a Node.js account API and MySQL 8.4 database. See the deployment checks below for the current server state.

## Current SIP deployment path

The `kamailio-rebuild` branch stages Kamailio and RTPengine on Debian 12 and includes a separate loopback-only API pilot. The reported server pilot passed syntax parsing and local SIP challenge tests; live trunk calls, RTP, billing and high availability have not been commissioned. The super admin Kamailio SIP screen manages shared tenant domain, account and carrier routing data. Adapter node settings are staged with revisions; they do not apply a host configuration. See `deploy/kamailio/` and the sections below.

The earlier FreeSWITCH playbooks and XML bridge remain in the repository as legacy code; the current GUI no longer presents FreeSWITCH as the active switch. Do not use the older installation commands for this Kamailio rollout. The MySQL tenant and gateway tables with historical switch names are still required by Kamailio authentication and routing and must not be dropped.

## Generate the MySQL database

Docker Compose creates the database and runs every implemented migration automatically. For an external MySQL installation, install MySQL 8.4 and Node.js 22 or newer, create the database and grants as an administrator, then run the migration command:

```sh
mysql -u root -p < services/api/create-database.sql
cd services/api
npm install
MYSQL_URL='mysql://USER:PASSWORD@127.0.0.1:3306/olamide' node migrate.js
```

`create-database.sql` creates the `olamide` database using `utf8mb4`. The migration command applies all implemented schema modules. Create a dedicated MySQL application user with the privileges shown in `create-database.sql` and keep the MySQL server time zone at UTC.

Set the application connection URL only on the API server. URL-encode reserved characters in the password:

```sh
cd services/api
npm install
MYSQL_URL='mysql://USER:PASSWORD@127.0.0.1:3306/olamide' \
PUBLIC_ORIGIN='http://127.0.0.1:5173' npm start
```

The API reapplies idempotent migrations on startup. On a remote MySQL connection, configure `MYSQL_SSL_CA` with the path to a trusted CA certificate. This deployment uses the same DDL-capable application credential for its migration job; keep it private and back up the database regularly.

This is a **new MySQL schema**. It does not import records from an earlier PostgreSQL database. If you have a populated PostgreSQL deployment, export, transform, and verify those records separately before switching traffic.

In another terminal, start the browser app:

```sh
cd apps/web
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. Vite forwards `/api` HTTP and WebSocket traffic to the API on port 8080. The MySQL integration check runs in GitHub Actions against MySQL 8.4. Locally, set `TEST_MYSQL_URL` to a disposable database before running `npm test` in `services/api`; `npm test` in `apps/web` runs its client tests.

## Current features

- SIP registration over secure WebSocket, browser WebRTC audio calling, answer/reject, hold/resume, hangup, and DTMF. Verified signup creates a SIP account record; live use requires a commissioned WSS/WebRTC switch and successful switch provisioning. Signup does not assign a phone number or plan.
- Account registration and sign-in with scrypt password hashes and HttpOnly session cookies. Users can add contacts and exchange server-stored text messages. Messages have no end-to-end encryption or push delivery.
- Administrators can create user groups, assign feature access, see aggregate counts, create monthly plans, set a default SIP WSS URL, and set a DID markup. The Standard group permits meetings, screen sharing, messaging, and billing; pointer assistance starts disabled.
- Administrators can run tenant-scoped UTC reports for recorded calls, answer rate, duration, CDR sources and hours, invoice status by currency, DID inventory, port requests, registrations, and PBX agent status. Daily call and invoice summary CSV exports are available.
- Administrators can set a tenant background and permit or lock individual choices. Signed-in users can save personal day/night presets, switch by their device's local time, and enable gentle movement. The five built-in gradients use validated presets and honor reduced-motion preferences; no arbitrary CSS or external image URL is accepted.
- Plan requests create unpaid invoices. Optional tenant-configured Stripe Checkout can mark an invoice paid after signed webhook reconciliation; card data stays with Stripe and subscriptions are not activated automatically.
- Flowroute and DIDWW number inventory can be displayed when API credentials are configured. The default DID setup and monthly markup is 30%, rounded up to cents. Number purchasing is disabled. Port requests are drafts and are not submitted to carriers.
- Up to four signed-in participants can join a peer-to-peer meeting with audio/video, screen sharing, temporary chat, and host lock/remove/end controls. A permitted helper can request pointer assistance; the sharer must approve and can revoke it. The pointer is a page overlay and cannot control the operating system.
- Tenant geofence policy in MySQL, edited in **Administrator → Tenant calling area policy**. The default is disabled. Client location checks alone are not enforceable service controls; configure enforcement independently on the SIP switch.

Provider credentials belong only in the API environment:

```sh
FLOWROUTE_ACCESS_KEY='...' FLOWROUTE_SECRET_KEY='...' \
DIDWW_API_KEY='...' DIDWW_ACCOUNT_CURRENCY='USD' \
MYSQL_URL='mysql://USER:PASSWORD@127.0.0.1:3306/olamide' npm start
```

DIDWW inventory quoting requires confirmation that the provider account uses USD. A purchase must recheck inventory, taxes, eligibility, payment settlement, and provider pricing. No provider order is placed by this application.

For cross-network meetings, configure `MEETING_ICE_SERVERS_JSON` or the optional coturn profile below. TURN credentials sent to browsers expire after one hour. The browser and API need a same-origin HTTPS reverse proxy in production. There is no native remote desktop agent.

## Limits before service launch

The repository is a development foundation. PBX and call center configuration is a planning control plane; no SIP switch or live call routing is connected by default. It includes a Debian FreeSWITCH installation foundation and browser controls, but live carrier routing, rated billing/settlement, DID purchase automation, full network device adapters, distributed database failover, and production telecom acceptance remain incomplete. Email OTP and passkeys require the configuration described below. The wallet starts with zero balance and has no funding or payout integration. Browser-only geofencing and group flags cannot enforce policies on an external SIP server or inspect peer-to-peer media. Add a trusted SIP/media service, backups, operational monitoring, abuse controls, migrations, and security review before accepting real users or payments. No Acrobits, WhatsApp, Cash App, Zoom, or Zoiper code or branding is included.

## Feature status and boundaries

This repository contains a browser SIP dialer, a MySQL-backed account API, FreeSWITCH installation and XML bridge, and administration screens. The supported switch deployment can provision tenant SIP accounts and dialplan lookups when commissioned. PBX, queue, DID routing and rate deck features still need live carrier, media, charging and acceptance work. Neither a plan invoice nor a previewed rate is a charge.

| Area | Available now | Additional service required |
| --- | --- | --- |
| Browser softphone | SIP.js registration and WebRTC audio calling, hold, mute, DTMF, account-scoped favorites, recent app-side call entries, account-scoped do-not-disturb, selectable audio output where supported | SIP WSS server, users, trunks, SBC, TURN as appropriate |
| PBX control plane | Tenant extensions, queue membership, DID destination maps, voicemail/forwarding intent | Switch provisioning, active dialplan, voicemail recording and delivery |
| Call center | Manual agent availability, ring-all/ordered/longest-idle eligibility preview | Live queue engine, call distribution, SLAs, recording, wallboards |
| Carrier routing | Planned trunks, prefix rate deck, tenant call barring with longest-prefix allow exceptions, longest-prefix least-cost preview; authenticated normalized call-record intake | Carrier credentials, switch enforcement, fraud controls, live CDR source and reconciliation |
| Billing | Monthly plan drafts, invoices, optional Stripe hosted Checkout for USD invoices, DID markup quotes | Taxes, prepaid balance enforcement, rated CDR settlement, fulfillment and other gateways |
| Deployment | Debian bootstrap, TLS web/API stack, validated Git pull, backups before updates, OS security updates | Public DNS record, SSH/console access, carrier and SIP services |

### Nigerian in-house DID inventory

The Nigerian Communications Commission's National Numbering Plan lists `203150XXXX`, `203151XXXX`, `203152XXXX`, `203153XXXX`, and `203154XXXX` as five 10,000-number Ilorin blocks allocated to **Smooth Multi-Service Platform Limited**. Their E.164 forms run from `+2342031500000` through `+2342031549999`, within those five contiguous blocks. NCC allocation does not establish that every individual number is unused, under this application's operational control, or reachable. Confirm the allocation holder's authorization, actual unused inventory, interconnect, and routes before offering numbers. Source: https://ncc.gov.ng/operators/national-numbering-plan?page=2

An administrator selects each block under **Administrator → In-house DID management**, sets setup and monthly prices in cents, and imports its 10,000 numbers into MySQL as **unverified** candidates. Import is transactional and cannot run twice for the same block; duplicate numbers are skipped. The administrator may then publish a verified unused suffix range with an inventory reference and explicit confirmation. Only published numbers appear in the customer search. The API does not verify unused status with the allocation holder, so the administrator must reconcile inventory independently. These actions do not create SIP routes or fulfill purchases.

An administrator can stage a **valid individual E.164 number** with USD setup and monthly prices and a numbering-rights reference in **Administrator → In-house DID management**. Staged numbers are invisible to buyers. After independently checking the rights and reachability, the administrator can confirm and publish one. The server rejects invalid `+1` exchanges, duplicate numbers across tenants, and cross-tenant actions. Customers search published inventory and request a number. A MySQL transaction locks the number, creates an unpaid setup invoice, and reserves it for 24 hours; a second request for the same number fails. An administrator can release an expired reservation, voiding its unpaid invoice. This is **a reservation and invoice request, not a completed purchase**. Monthly fees are displayed but not charged. No payment confirmation, recurring billing, switch provision, inbound route activation, or carrier order is automated. Use the provider's assigned-number feed and switch provisioning acknowledgements before enabling fulfillment.

### Nigeria operator interconnect and NINAuth

The **Nigeria interconnect plans** admin panel stores a tenant-scoped clearinghouse or local-operator name, signaling host, port, transport, `234` destination prefix, and interconnect agreement reference. The preview picks the longest matching planned prefix for a `+234` number. It does not connect to a peer or route media. Obtain the exact point of interconnect, trunk authentication, IP allowlist, codec plan, routing authorization, fraud limits, CDR settlement specification, and commissioning test results from the licensed operator/clearinghouse before configuring a live switch. This application does not install a Nigerian gateway.

The **Nigeria identity verification** panel reports NINAuth as disconnected. It does not ask for, store, or claim to verify a NIN. NIMC's NINAuth enterprise integration requires registration and an approved verification relationship, exact redirect URI, user consent, PKCE, backend token exchange, and validation of the result. Obtain the approved enterprise/partner configuration and test access, then implement and security-review that exact provider flow; do not substitute a local NIN format check for identity verification. Do not put NINs, client secrets, access tokens, or profile data in GitHub, browser storage, or application logs.

### Browser calling tools

Account, billing, support, calling tools and multi-form administrator screens use labeled form groups. Open a group to reveal its actions; use the short links near the top of longer screens to jump directly to a group. The same existing form IDs and backend endpoints are used after grouping. The email login group is open by default; create-account and directory-login groups remain available separately.

After signing in, use the grouped workspace menu to open one screen at a time. **Workspace** has dashboard, search and support; **Communications** has the dialer, calling area, messages, meetings and agent view; **Commerce** has plans and numbers; **My settings** has account security, locale, appearance and downloads. Administrators see additional operations and settings groups. Super administrators also see tenant management. Menu search filters visible links, and the compact **Language & currency** menu saves preferences to the account API. Public sign-in destinations use the same account login; only a role assigned by the server enables administrator menus. An incoming SIP call brings the dialer screen forward while the page is connected.

Sign in to Olamide, then connect with a provisioned SIP address, authorization username, password, and secure WebSocket URL. Dial a full `sip:user@domain` address. During a connected call use **Hold**, **Mute**, and **Send tone**. Favorites and do-not-disturb settings are saved to your account through `/api/softphone/preferences`; recent app-side call entries are saved through `/api/softphone/calls` and limited to the newest 50 on screen. **Clear recent calls** removes this account's app-side entries. These entries are not switch or carrier CDRs and can miss calls when the client is closed or offline. Do-not-disturb automatically declines incoming calls only while this client is connected. **Refresh audio outputs** lists available speakers; choosing one requires browser support for `setSinkId` and may require device permission. SIP passwords are used in the current client session and are not saved in the preferences API.

The administrator can set an enabled calling area policy, maximum location uncertainty, and up to 20 allowed circular zones per tenant. The browser fetches `/api/geofence` when signing in and immediately before each outgoing call; `/api/admin/geofence` manages the tenant policy. An enabled policy with no allowed zones is rejected. The browser requests fresh device location and blocks its own dial action when outside a zone or unable to get an accurate position. Browsers and devices can misreport location, and SIP traffic can use another client, so this is not carrier grade geofencing or network level authorization. Enforce any required restrictions in the PBX/SBC independently. The DID pricing preview also uses `/api/admin/pricing/preview`, sharing the server's price calculation and validation with actual pricing rules.

Favorites, recent calls, and do-not-disturb are stored in this browser's local storage, with no cross-device synchronization. Incoming caller identity is not available through the current SimpleUser delegate and appears as “Unknown caller” in recent calls. Recent calls are a convenience list, not carrier CDRs or billing evidence. This page does not provide Acrobits' native push wakeup, CallKit/Android Telecom integration, native contacts, SIP video calls, attended transfer, conferencing, voicemail provisioning, SIP SIMPLE messaging, or mobile background operation. Those require additional SIP client and server development and platform-specific integration.

ASTPP includes carrier-grade softswitch, online charging, reseller billing, routing, DID management, and fraud controls; 3CX includes a live PBX and queue engine. The Olamide control plane is **not** a substitute for either complete product. Do not advertise or rely on prepaid charging, automatic call recording, emergency calling, lawful intercept, carrier routing, or live queue service until those components have been separately implemented and verified.

PortaOne's PortaSwitch also provides SIP call processing, media applications, phone provisioning, customer and reseller self-care, real-time authorization, and rating. The Olamide administrator can save per-tenant outbound prefix rules under **PBX and call center configuration → Outbound call barring policy**. Save a `block` rule for a broad prefix and an `allow` rule for a more specific exception; the longest matching prefix wins in the route preview. Removing a rule immediately changes preview results. This policy is stored in MySQL but **does not block calls on a SIP switch**. Olamide also accepts normalized signed CDR legs from an external switch, as described below. There is no live PortaOne integration, charging engine, automated CDR reconciliation, or reseller settlement. Before going live, provision the exact same policy on an authoritative switch and test fail-closed behavior there.

### Switch call-record ingestion

Set `CDR_INGEST_KEYS_JSON` in the private API environment to a JSON object mapping each tenant UUID to a separate random HMAC secret of at least 32 characters. Generate a secret with `openssl rand -hex 32`; do not commit it. The default tenant is `00000000-0000-4000-8000-000000000000`. On the server, edit `/etc/olamide/secrets.env` and rerun bootstrap to apply it. Keep the file mode 0600. Remove a tenant entry to revoke its ingestion key. Rotate keys with a controlled switch cutover; the current configuration permits one key per tenant.

`POST /api/integrations/cdr` accepts at most 8 KiB of normalized JSON with `Content-Type: application/json`. Its `X-CDR-Timestamp` is Unix seconds within five minutes of the API clock. Its `X-CDR-Signature` is lowercase or uppercase hex HMAC-SHA256 of the UTF-8 bytes `timestamp + "." + raw_request_body` with that tenant's secret. The caller must supply `tenantId`, `source` (switch identifier), `legId` (unique per source and call leg), `direction` (`inbound` or `outbound`), E.164 `from` and `to`, `disposition` (`answered`, `missed`, `rejected`, or `failed`), integer `durationSeconds`, integer `billableSeconds`, and UTC ISO `startedAt` (for example `2026-10-04T06:00:00Z`). The adapter connecting a switch must normalize its native event fields, map each call leg to the correct tenant, and sign the raw body. A native FreeSWITCH JSON CDR is **not** this normalized contract.

The API stores each `(tenantId, source, legId)` once. An exact replay returns `duplicate:true`; a changed record under the same key returns HTTP 409 for investigation. The admin **Imported call records** panel shows the 100 latest legs for the selected tenant. These records are unrated and never alter invoices, balances, or payments. Source attribution, clock synchronization, completeness checks, fraud monitoring, lawful retention, and reconciliation with the carrier are required before using CDRs for billing. Protect the endpoint with network controls as well as HMAC; its origin exemption exists for server-to-server delivery.

## Step-by-step first pull on a bare Debian 12 server

**Prerequisites:** a Debian 12 machine with root/console access, outbound HTTPS to Debian/Docker/GitHub, and sufficient disk space for MySQL backups and container builds. In your DNS provider, create an **A record** named `sip` in `dobhrap.com` pointing to the server's public IPv4 address. If IPv6 is configured, point its AAAA record to the same server or remove a stale AAAA record. Allow inbound TCP 80/443 for Caddy's HTTPS certificate and web app. Maintain your SSH access separately. The repository does not contain your public IP, SSH key, or database passwords. Only the web/API stack is installed; no SIP/RTP ports are opened by this playbook.

1. In the provider console, ensure SSH is running and that your login has root or sudo access. If port 22 refuses connections, check `systemctl status ssh`, your cloud firewall, and the provider's console before continuing. Never put a root password in GitHub Actions secrets or this repository.
2. Confirm DNS: `getent ahostsv4 sip.dobhrap.com`. Its address must be this server. HTTP and HTTPS need to be reachable from the internet for the public TLS check.
3. On the server as root, run the **single installer script**. If the repository is already present:

   ```sh
   cd /root/Sip
   OLAMIDE_DOMAIN=sip.dobhrap.com OLAMIDE_PUBLIC_IP=YOUR_VERIFIED_PUBLIC_IPV4 bash deployment/install-all.sh
   ```

   On a completely bare host, first obtain the one script from this repository (review its contents before executing), then run it. Replace the address with the actual public IPv4 shown in your server provider console:

   ```sh
   apt-get update
   apt-get install -y ca-certificates curl
   curl --fail --location --show-error https://raw.githubusercontent.com/olamidebello/Sip/main/deployment/install-all.sh -o /root/olamide-install-all.sh
   OLAMIDE_DOMAIN=sip.dobhrap.com OLAMIDE_PUBLIC_IP=YOUR_VERIFIED_PUBLIC_IPV4 bash /root/olamide-install-all.sh
   ```

   `install-all.sh` requires Debian 12 and root, validates the address and DNS, installs the minimal Git prerequisite, clones a fresh copy of this repository, and calls the Ansible installer and bootstrap. Bootstrap installs Ansible, curl, jq, OpenSSL, Docker Engine and Compose, then generates two distinct random database passwords in `/etc/olamide/secrets.env` (mode 0600). It selects a main-branch commit whose GitHub validation workflow has completed successfully and deploys that commit. Re-running the installer keeps the existing secrets and data. The script does not request or store SSH passwords. From a sudo-capable account, use `sudo env OLAMIDE_DOMAIN=sip.dobhrap.com OLAMIDE_PUBLIC_IP=YOUR_VERIFIED_PUBLIC_IPV4 bash deployment/install-all.sh`.
4. Open `https://sip.dobhrap.com/api/health` and expect `{"status":"ok"}`. Open `https://sip.dobhrap.com` to reach the browser client. A failed DNS/TLS check stops the playbook; inspect `journalctl -u olamide-compose` and `docker compose ps` in `/opt/olamide/repo/deployment/docker`.

   **MySQL CPU compatibility:** The official `mysql:8.4` image uses Oracle Linux 9 and needs an x86-64-v2 capable virtual CPU. If `docker compose logs mysql` repeatedly reports `Fatal glibc error: CPU does not support x86-64-v2` with exit 127, ask the VM provider to expose x86-64-v2 features or use a compatible VM plan/CPU model. This is a provider CPU setting or hardware limitation; restarting the container and opening firewall ports will not fix it. Keep `/opt/olamide/repo/deployment/docker` and Docker volumes intact. After the provider changes the virtual CPU and reboots the VM, run `docker run --rm --entrypoint /bin/true mysql:8.4` to verify compatibility, then rerun `deployment/install-all.sh` to finish the Ansible playbook. The playbook probes the image before starting the application and reports a specific error if the CPU is incompatible.
5. Create your first account in the browser, then promote that existing account on the server:

   ```sh
   cd /opt/olamide/repo/deployment/docker
   docker compose exec -T api node promote-super-admin.js admin@example.com
   ```

   Replace the example email. There is no public super-admin registration. Sign out and in to refresh the interface.
6. In **Administrator → Server URL**, set the **actual external SIP WSS URL** supplied by your PBX or provider, for example `wss://pbx.example.com:8089/ws`. The domain `sip.dobhrap.com` serves this web app; it is not a SIP switch by itself. Test only with an authorized SIP account. Configure `MEETING_ICE_SERVERS_JSON` in `/etc/olamide/secrets.env` for TURN if peer-to-peer meetings must cross restrictive networks, then rerun bootstrap to copy changed secrets and restart the stack.

### Existing external controller deployment

### Optional FreeSWITCH package staging

The server-side `deployment/bootstrap.sh` remains the validated web/API/MySQL installer used by `deployment/install-all.sh`. For a combined app and FreeSWITCH install from a trusted Debian or Ubuntu controller, run `bash deployment/controller-bootstrap.sh` from a persistent checkout, or use `deployment/install-class5.bat` through WSL on Windows. The controller flow prompts for the application DNS name, public IPv4, SSH user, SignalWire package token and Ansible Vault password, then installs the application and switch. Keep the private inventory, Vault file, runner token and SSH keys on the controller.

The switch playbook installs the official vanilla FreeSWITCH package, blocks package auto-start, deletes bundled demo SIP users and demo dialplan destinations, rotates the event socket password, binds that socket to localhost, and leaves the switch **stopped and disabled**. No customer extension, DID, carrier, outbound route, or WSS endpoint is automatically activated. The package's default demo accounts must never be exposed with their shared password. Keep SIP and RTP ports closed until a separate production configuration has been commissioned.

To commission service, an operator must supply valid numbering allocation/LOA, carrier and Nigerian clearinghouse agreements, authenticated peer endpoints and IP allowlists, emergency-calling policy, abuse controls, rate/charging decisions, media/RTP address and port ranges, TLS certificates for WSS, TURN as needed, and a tested dialplan that synchronizes tenant provisioning from MySQL. Test registration, internal and external calls, inbound DID reachability, CDR completeness, failover, fraud blocking, and restore procedures before starting FreeSWITCH. This repository does **not** provide a complete carrier-grade class 5 switch or automatic live provisioning. A single server is a single point of failure; redundant signaling, media, database, and network nodes are needed for carrier availability. The existing Git updater rebuilds web/API containers and does not hot-reload or reconfigure FreeSWITCH.

An Ansible controller can deploy the same stack after creating a private `deployment/secrets.env` from `deployment/secrets.env.example`. Set `DOMAIN=sip.dobhrap.com`, `MYSQL_URL` with a URL-safe encoded password matching `MYSQL_PASSWORD`, and a distinct `MYSQL_ROOT_PASSWORD`. Verify the server's SSH host key fingerprint through your provider console before adding it to `~/.ssh/known_hosts`. Run:

```sh
OLAMIDE_DOMAIN=sip.dobhrap.com ansible-playbook -i "YOUR_SERVER_HOST," -u YOUR_SSH_USER deployment/ansible/site.yml
```

The GitHub Actions workflow **validates code only**. The installed server pulls validated commits directly from GitHub; it needs no GitHub SSH deployment secret. The repository is public, so the server queries GitHub's public workflow runs API without a token. GitHub API limits or an incomplete workflow delay updates without replacing the running app.

### Updates, backups, and recovery

- `olamide-update.timer` checks GitHub every 15 minutes. It accepts only a successfully validated main-branch push commit. Before a changed version is applied, `deployment/update.sh` takes a compressed MySQL dump into `/opt/olamide/backups/` with restricted permissions, builds fresh Node/Caddy images, and checks API health. On a failed check it restores the previous **application commit**. MySQL schema/data are **not** automatically rolled back; restore the database backup deliberately after assessing the failure. Monitor disk space and manage backup retention externally.
- Debian `unattended-upgrades` installs security updates automatically. Automatic reboots are disabled to avoid unplanned call interruptions. Review `/var/run/reboot-required`, schedule a maintenance reboot, and separately plan Docker/MySQL image security updates. The Git updater pulls fresh Node/Caddy base images when it builds a new app commit; it does not silently advance the MySQL image.
- Inspect: `systemctl status olamide-update.timer olamide-update.service olamide-compose.service`, `journalctl -u olamide-update.service -n 100 --no-pager`, `docker compose ps`, and `docker compose logs --tail=100 api web mysql` from `/opt/olamide/repo/deployment/docker`.
- To pause Git updates: `systemctl disable --now olamide-update.timer`. To apply a validated commit immediately: `systemctl start olamide-update.service`. For a manual app rollback, pause the timer, back up the database, use `git -C /opt/olamide/repo checkout --detach COMMIT_SHA`, then run `docker compose up -d --build` in `/opt/olamide/repo/deployment/docker`. Assess schema compatibility before reverting code.
- Database credentials stay in `/etc/olamide/secrets.env` and `/opt/olamide/repo/deployment/docker/.env`, both mode 0600. Back up the secrets securely outside the server. Changing MySQL environment passwords on an existing volume does **not** automatically change MySQL account passwords; rotate them inside MySQL and update both URL and environment file together.

## Administrator manual

### Tenants, users, and feature access

1. Sign in as the server-promoted super admin. In **Administrator → Tenants**, create a tenant name and slug. The system creates its Standard group. Choose that tenant and click **Manage selected tenant** to change your admin context. You can return to the original tenant the same way.
2. Add users or tenant administrators with an initial password under **Create tenant user**. Send credentials privately and require a new credential workflow before production use; self-service password reset and MFA are not implemented. Tenant administrators cannot create other tenants or promote a super admin.
3. In **User groups and feature access**, create groups, select permitted features, and assign users. All membership queries are tenant scoped. Suspending a tenant blocks its HTTP sessions and closes its active meeting WebSockets. Super admins can reactivate it.
4. Review the admin overview for the currently selected tenant. Email addresses are globally unique across tenants. Existing accounts migrated to the original Olamide tenant.
5. In **User groups and feature access**, select a user to suspend or reactivate their login, revoke sessions, or change between user and tenant administrator. Role and suspension changes revoke existing sessions and close active meeting connections. A user cannot modify their own role or suspension status; the last active tenant administrator cannot be suspended or demoted. A super admin account cannot be modified by a tenant administrator. Delete a custom group only after removing its members; the Standard group is protected.
6. Review **Recent security events** for password changes, account actions, group permission changes, membership changes, and group deletion. The latest 100 events for the selected tenant are shown. Local-password users can change their password under **Olamide account**; this revokes their other sessions. LDAP users change their password in their directory. Audit records remain in MySQL and require a separate retention and backup policy. This is password and session management, not MFA, identity verification, intrusion detection, or a production security operations system.

### LDAPS authentication and group mapping

1. Obtain an authorized **LDAPS** endpoint and a read-only service account scoped to the user subtree. The app requires a trusted server certificate and does not permit plain `ldap://` or disable TLS verification. In the private `/etc/olamide/secrets.env` (mode 0600), set `LDAP_TENANTS_JSON` to a JSON object keyed by tenant UUID. For example, use a single-quoted env value with placeholders: `LDAP_TENANTS_JSON='{"00000000-0000-4000-8000-000000000000":{"url":"ldaps://directory.example.org:636","baseDn":"ou=people,dc=example,dc=org","bindDn":"cn=search,dc=example,dc=org","bindPassword":"REPLACE_WITH_PRIVATE_SECRET"}}'`. Use an internal DNS name resolvable from the API container and a certificate trusted in that container. Optional `caFile` is a path **inside the API container**; mount a private CA file read-only with a Compose override if your directory uses a private CA. Do not commit credentials or display them in the admin UI. Rerun bootstrap to apply server environment changes.
2. In **Administrator → LDAP authentication and group access**, choose the tenant context, map an exact directory `memberOf` group DN to each app feature group, then enable directory sign-in. The API stores only mappings and the enable switch in MySQL. Server bind credentials stay in the private environment. The admin API is `GET/PUT /api/admin/ldap`, `POST /api/admin/ldap/mappings` with `groupDn` and tenant `groupId`, and `DELETE /api/admin/ldap/mappings/:id`. LDAP cannot be enabled until its tenant has a server connection. Directory configuration is not returned by the API.
3. Users select **Directory sign-in**, enter the tenant slug, directory email, and password. The backend binds its read-only search account over LDAPS, searches `mail` with an escaped exact-match filter, requires one result and matching email, and verifies the user password by binding as the returned DN. The directory must expose direct group DNs in `memberOf`; nested groups, paging, arbitrary search filters, and automatic directory group discovery are not implemented. At least one mapped group is required. A new user is created with `auth_source=ldap` and a random unusable local password; group memberships synchronize on each successful LDAP sign-in. Existing local-password accounts with the same email are **not** silently linked to LDAP. Directory passwords are never stored in MySQL.
4. LDAP app sessions expire after one hour. Disabling LDAP or removing a mapping revokes directory sessions and closes active meeting connections. User suspension also blocks sign-in. Manual app-group assignment to an LDAP user is blocked; edit mappings or directory membership instead. An existing session is not continuously revalidated against LDAP between sign-ins, so a directory-side removal can retain app access until the one-hour session expires unless an administrator disables LDAP, removes a mapping, or suspends the user. Plan shorter session policy or a revocation feed for a stricter environment. Keep a local super-admin account for recovery. The LDAP connection is tenant specific, and users' email addresses remain globally unique across tenants in this app.

The LDAPS client and filter escaping follow the [ldapts documentation](https://github.com/ldapts/ldapts#configuring-secure-connections). Validate connectivity, CA trust, search permissions, `memberOf` values, mapping behavior, failed logins, and session revocation against your actual directory before enabling it for users.

### Super-admin authentication provider controls

The **Authentication providers** panel displays the current tenant's local-password and LDAPS states. A super admin can enable or disable local sign-in for a selected tenant and decide whether tenant administrators may manage the LDAP enable switch and group mappings. Tenant administrators can view the policy but cannot edit it; when LDAP management is locked, they cannot change LDAP mappings. The original Olamide tenant always retains local super-admin recovery. For another tenant, local sign-in can be disable…12620 tokens truncated…des idempotent CDR rating and rerating, per-call price snapshots, tax and currency precision, prepaid reservation/cutoff during a call, concurrent call limits, refund/reversal accounting, failed delivery recovery, tenant isolation, and carrier statement and cash reconciliation. Provisioning these requires more than installing packages; the switch must deny calls when the authorization path is unavailable and billing must never mutate balances from untrusted or duplicate events.

A trusted switch event producer must POST raw JSON to the private `/api/integrations/calls/events` API using `X-CDR-Timestamp` (Unix seconds) and `X-CDR-Signature` (hex HMAC-SHA256 of `timestamp + "." + raw JSON`) with the tenant's secret in private `CDR_INGEST_KEYS_JSON`. Each event contains `tenantId` (UUID), `eventId` (new UUID), `source`, `legId`, `direction` (`inbound` or `outbound`), `from`, `to`, `event` (`ringing`, `answered`, `heartbeat`, or `ended`), and `occurredAt` (UTC ISO timestamp). Send `ringing` first, then answer/heartbeats/end with the same leg ID. Event IDs are idempotent and events outside a five-minute clock window are rejected. Use a heartbeat at least every minute during long calls. Configure that producer and confirm real carrier call traces before treating the monitor as live traffic. This branch's loopback staging Kamailio adapter does not emit those events or commission a carrier. Plan event retention and access to calling metadata before production traffic.

On a GUI deployment, `deploy/kamailio/deploy-production-gui.sh` generates `AI_CONFIG_KEY` in the private production Compose environment if missing. After deployment, sign in as super administrator, open **Help & tutorials → AI support guide → Super admin AI setup**, and save a provider-issued OpenAI API key. The key is encrypted with AES-256-GCM in `ai_support_configuration`, is write-only in the GUI, and can be replaced or removed. The encryption key stays on the server and must be backed up alongside the database: losing it makes the saved AI key unreadable. A saved key takes precedence over any legacy environment key. If no key has been saved, the legacy environment key remains available. Model calls are server-side and drafting does not execute automation.

### SIP profile access and saved dialer connections

The super administrator opens **Administration → SIP profile access** and selects a tenant. Tenant defaults control `view`, `add`, `edit`, and `delete`; group grants may allow additional actions; an individual user's explicit allow or deny takes priority. New tenants default to view only. Group and user selections are checked against the selected tenant by the API. Policy writes require the `super_admin` role. Group and user policies are removed automatically when those records are deleted.

Signed-in users can save SIP connection settings in **My settings → Account & security**, subject to their effective permissions. **Use in dialer** copies the connection address, username, and WSS endpoint to the browser dialer; the SIP password must be entered for each connection. Saved profiles do not store passwords, create live SIP registrations, or change a provider's dialplan. The existing automatically created SIP account and its credential reveal also require `view` permission. A profile can be edited or deleted only by its owner in the current tenant, even if another user has the corresponding permission. The API validates secure `wss://` endpoints and scopes all profile writes to owner and tenant.

MySQL startup migration creates `sip_profiles`, `sip_profile_tenant_permissions`, `sip_profile_group_permissions`, and `sip_profile_user_permissions` with foreign keys. The API paths are `GET/POST /api/sip-profiles`, `PUT/DELETE /api/sip-profiles/{id}`, `GET /api/admin/sip-profile-policy?tenantId={id}`, and `PUT /api/admin/sip-profile-policy/{tenant|group/{id}|user/{id}}`. Policy PUT bodies include `tenantId` and a `permissions` object with boolean action keys. Tenant policy requires all four keys; group/user policy may omit keys to inherit. The visible workspace navigation also includes a **Sign out** button using the existing logout endpoint.

### Stripe Checkout and provider callback administration

The **Stripe gateway** panel is available to tenant administrators and super administrators in their selected tenant. Enter the Stripe secret API key and the endpoint's webhook signing secret; save them with `PAYMENT_CONFIG_KEY` configured as 64 hexadecimal characters. The API encrypts both secrets with AES-256-GCM in `payment_gateways`; GET returns only masked configuration state. Never rotate `PAYMENT_CONFIG_KEY` without migrating/re-encrypting these records. Fresh installs generate the key; existing servers add it on the next updater run. Keep `/etc/olamide/secrets.env` and the Compose `.env` private and backed up securely.

The panel displays the exact tenant webhook URL: `https://<DOMAIN>/api/webhooks/stripe/<TENANT_ID>`. In Stripe configure `checkout.session.completed` and `checkout.session.async_payment_succeeded` for that URL, then paste the resulting `whsec_` signing secret. Enable the gateway after testing. A user can click **Pay with Stripe** on an unpaid, positive USD invoice. The server locks and snapshots the invoice amount, creates a Stripe Checkout Session with a stable idempotency key, and returns Stripe's hosted URL. A browser redirect is never accepted as proof of payment. Raw-body signature and timestamp validation, event deduplication, amount/currency/tenant reconciliation, and a MySQL transaction mark the invoice paid. `payment_attempts` and `payment_events` store the audit trail. Payment does not activate subscriptions, assign a DID, credit a wallet, calculate taxes, or commission SIP service. Stripe refund, dispute, and asynchronous reconciliation operations require an operator workflow before live use. Other gateways need a separately implemented provider adapter.

**Super admin → Provider callbacks** creates a tenant-scoped, disabled callback configuration for DIDWW or another provider slug. Copy the generated URL once into the provider console, then enable it. **Rotate callback URL** immediately invalidates the prior secret; **Enable/Disable** and **Refresh providers and events** call the backend. Secrets are stored as SHA-256 hashes, and the API accepts a matching HTTPS URL and bounded JSON payload only. The `provider_webhook_events` table records receipt time, content type and payload SHA-256 for review, not the message body. These generic events are not mapped to DIDs, SMS, orders, or carrier actions until an authenticated provider-specific event adapter is commissioned. Flowroute SMS/MMS and DLR callback URLs and handling remain in **Messaging webhooks**; Stripe uses its own signature-verified route. Do not enter a provider URL unless that provider can deliver to it.

### Local API capacity control

**Administration → API capacity** shows the desired and last applied API replica counts and recent requests to tenant administrators. Super administrators may request one to four API replicas. The API records the requested revision in `cluster_state` and `cluster_actions`; it never receives Docker socket access. On the deployment host, `olamide-cluster.timer` runs a root-only service every minute. It reads the bounded request from MySQL through the API container, runs `docker compose up -d --no-build --scale api=N api`, and reports the applied revision or failure. Reapply Ansible or run `bash /opt/olamide/repo/deployment/install-cluster-timer.sh` after updating older installations if the timer is missing. Review `systemctl status olamide-cluster.timer olamide-cluster.service` and `journalctl -u olamide-cluster.service -n 100 --no-pager` when a request remains pending. This scales API processes on one Docker Compose host; MySQL, Caddy, SIP/media, TURN, and multi-host failover require separate infrastructure and are not clustered by this control.

## Administrator guide: Flowroute and DIDWW trunks

The **Provider API credentials** form stores keys for number inventory and the DIDWW API. A provider's **SIP trunk credentials and peering settings are separate**. A PBX trunk record, rate quote, or API inventory verification does not register or connect Kamailio. On the current staged Kamailio adapter, carrier INVITEs return 503. Complete the host and media commissioning gate below before sending live calls.

### Shared preparation

1. Sign in as super administrator and select the intended tenant. Ensure `PROVIDER_CREDENTIAL_KEY` is set to a stable 64-character hex value in the API server's private environment; restart the API after adding it. Do not paste provider secrets in the README, Git, screenshots, or support tickets.
2. In **Carrier provider commissioning → Provider API credentials**, select Flowroute or DIDWW. Save the full key set. **Refresh credential status** shows the revision and enabled state but never reveals the secret. **Edit / rotate** replaces the entire set; **Disable** blocks stored credentials and provider inventory even if legacy environment keys exist.
3. In **PBX → Trunk management and rate deck**, create a tenant trunk with the actual provider signaling host, port, transport, and priority. Use **View** for linked rates and carrier profiles; **Edit** requires the current revision. The **Enable preview** control changes planning state only.
4. In **Carrier provider commissioning**, select the provider and trunk, choose capacity and routing intent, and save the draft profile. Set up an HTTPS carrier provisioning adapter in private server configuration, then use **Carrier adapter nodes → Check health** and enable a healthy node. The adapter must acknowledge and verify actual provider and switch state; the GUI cannot create a live Kamailio carrier route on its own.
5. Add eligible tariff rates, outbound destination policy, fraud blocks and a carrier route key in **Kamailio tenant SIP settings**. Confirm tenant SIP domain and accounts. Test with a provider test number, check signaling, two-way RTP, call teardown, failover, and CDR/billing reconciliation before directing production traffic.

### Flowroute outbound and inbound

1. In the Flowroute account, obtain the **API access key and secret** for inventory and choose the **SIP interconnection method**: registration or IP authentication. Record the provider-approved signaling endpoints, source IP ranges, codecs, caller ID rules, and any technical prefix. Flowroute describes both interconnection methods in its [integration overview](https://flowroute.com/blog/faq/how-do-i-integrate-with-flowroute/).
2. Save the API key pair under **Provider API credentials → Flowroute** and click **Verify inventory API** on its carrier card. This checks inventory access only. It does not verify SIP authentication.
3. For the repo's shortcut, use **Flowroute PoP setup** (US-East-VA or US-West-OR) to create a disabled UDP 5060 trunk and draft profile. Otherwise create the trunk manually with the Flowroute endpoint and transport assigned to your account. Review it in **PBX**, then link it in **Carrier provider commissioning**.
4. Configure your Flowroute account's outbound SIP authentication and inbound DID route to the tested public SIP edge, according to the chosen interconnection method. Flowroute documents inbound [registration, host-based, and SIP URI routing](https://flowroute.com/blog/choosing-between-sip-registration-and-host-based-routing/). Associate the test DID with that route in the provider account.
5. Do not invoke **Provision with switch adapter** until the private adapter is implemented, health-checked, and able to verify the real SIP setup. **Verify inventory API** alone is insufficient. Messaging callback URLs are set separately under **Messaging webhooks**.

### DIDWW outbound and inbound

1. Confirm DIDWW has approved **Outbound Trunks** for the account. DIDWW says access is required before placing outbound calls; see its [outbound trunk access guide](https://doc.didww.com/voice/outbound-trunks/get-access.html). In the DIDWW User Panel, open **Voice → Outbound Trunks → Create New** and configure authentication, allowed SIP and RTP addresses, caller ID, capacity, media options, and a test destination according to the [outbound setup guide](https://doc.didww.com/voice/outbound-trunks/how-to-guides/create-outbound-trunk.html). Keep the SIP digest username/password private.
2. In **Provider API credentials → DIDWW**, save the **API key** and choose **Sandbox** or **Production** for the correct account. The API key is not the outbound SIP digest password. Set `DIDWW_ACCOUNT_CURRENCY=USD` and `DIDWW_TENANT_ID` privately for the tenant-bound API console. The DIDWW API console can list or manage permitted `voice_out_trunks` and `voice_in_trunks` resources, subject to provider access. Use **Verify inventory API** to test the key against DID inventory.
3. Copy the signaling endpoint and port shown for the approved DIDWW outbound trunk into a new PBX trunk. Link the draft profile in **Carrier provider commissioning**. DIDWW's [outbound credentials guide](https://doc.didww.com/voice/outbound-trunks/how-to-guides/view-outbound-trunk-credentials.html) explains where to view the SIP-specific values.
4. For inbound DIDs, create a DIDWW **Voice In Trunk** pointed at the tested public SIP URI and assign the DID to it in DIDWW. An inbound trunk is a separate resource that delivers calls to your SIP system; see [DIDWW inbound trunks](https://doc.didww.com/api3/2026-04-16/inventory-resources/voice-in-trunks/index.html). Configure the matching tenant DID route in Olamide and test an inbound call.
5. DIDWW API callbacks and Call Events require their own signed receiver and tokens as described below. The API key does not configure callbacks, SIP peering, RTP, or charging.

### Before carrier activation

Run `bash deploy/kamailio/commission-check.sh` on the switch host and resolve every blocked host gate. The current `adapter.cfg.j2` binds only to loopback and explicitly rejects carrier routes; the existing GUI cannot make that path live. The private adapter's `active` acknowledgment is a control-plane record, not evidence of an outbound call. Require successful authenticated SIP, inbound/outbound test calls, two-way audio, RTP cleanup, carrier failover and rated CDR reconciliation before production cutover.

## Carrier commissioning and future providers

The administrator Carrier providers screen is backed by the tenant-scoped
`carrier_provider_catalog`, `carrier_provider_profiles`, and
`carrier_provider_verifications` MySQL tables. Startup migration creates them.
Super admins can register a new carrier ID (2–16 lowercase letters, digits or
hyphens), then create a PBX trunk, save its profile, verify its adapter, and
activate it. Disabling a custom carrier requires adapter deactivation first.
Changing an active carrier profile or Flowroute PoP also requires deactivation.

Flowroute PoP setup creates or updates an initially disabled tenant trunk for
US-East-VA or US-West-OR on UDP 5060 and saves a draft profile. It does not store the SIP trunk password; provider API keys can be saved separately in the encrypted tenant credential store and are never returned to the browser. Keep provider secrets
in private server configuration and rotate any credentials shared in documents.

`CARRIER_PROVISION_URL` must be an HTTPS endpoint controlled by the switch
integration; `CARRIER_PROVISION_TOKEN` authenticates requests. The API sends
JSON `action` values `verify`, `activate`, and `deactivate` with
`tenantId`, `provider`, and `trunkId` (activation also sends capacity and
routing mode). A custom carrier's verification must return
`{"status":"verified"}`; activation must return `{"status":"active"}`;
deactivation must return `{"status":"inactive"}`. Non-2xx responses or
missing acknowledgement leave the carrier unactivated in the app. The adapter
must independently validate tenant/trunk ownership, load credentials from its
private store, apply switch configuration, and verify the resulting state.
The app's PBX route previews remain simulations until a real switch and media
path are connected. Flowroute's existing inventory API check verifies API
credentials only and does not establish SIP registration.

## DIDWW API v3 and callbacks

The super admin DIDWW API screen uses a tenant-bound server-side API key. Set
`DIDWW_TENANT_ID`, `DIDWW_ACCOUNT_CURRENCY=USD`, and the DIDWW-generated
`DIDWW_CALLBACK_SECRET` in private deployment configuration. Save the API key and
sandbox/production environment in the encrypted Provider API credentials section
(with a stable `PROVIDER_CREDENTIAL_KEY`), or set legacy `DIDWW_API_KEY` and
`DIDWW_API_ENV` privately on the API server. The API version
is pinned to `2026-04-16`. The browser never receives the key or callback
secret. The resource console restricts methods and paths to a documented
allowlist, validates JSON:API resource types and IDs, and records mutation
metadata in `didww_api_audit`; it does not persist the submitted request
body. An order or deletion can change live services and charges when the
environment is production.

For asynchronous Orders, Exports, verification, and outbound trunk status
callbacks, enable a Callback Secret in DIDWW and use the displayed HTTPS
`/api/webhooks/didww/<tenant-id>` URL as the resource's `callback_url`.
The receiver checks `X-DIDWW-Signature` with DIDWW's HMAC-SHA1 URL and payload
normalization before writing deduplicated event metadata. Choose POST
callbacks when configuring a resource; GET callbacks are also accepted.

DIDWW Call Events and CDR Streaming are a separate DIDWW service that support
must enable for the account. Set `DIDWW_CALL_EVENTS_TOKEN` to a random secret
and configure the DIDWW Call Events panel to send it as `X-Auth-Token` to the
displayed `/api/webhooks/didww/<tenant-id>/call-events` URL. The receiver
accepts JSON call events and JSON CDR batches (including gzip encoded
`text/plain`), deduplicates them, and stores event identifiers and hashes.
This receipt log does not rate calls, settle carrier charges, or store a full
CDR payload. Review DIDWW's account settings and test in sandbox before
switching to production. Actual DIDWW account provisioning and DIDWW support
enablement must be performed in the DIDWW account.

## Scalable carrier adapter registry

Set `CARRIER_ADAPTER_TARGETS_JSON` privately on the API service to a JSON
object of named HTTPS targets, each with a `url` and a 32+ character `token`.
The super admin Carrier adapters screen lists target keys without disclosing
URLs or tokens. Add one or more nodes for Flowroute, DIDWW, or a catalog carrier;
set a region, priority, and maximum planned concurrent calls. Nodes start
disabled. Run Check health, then enable a healthy node. The commissioning API
selects the lowest-priority eligible node with a successful health check in the last five minutes whose configured capacity
covers the carrier profile. It records the node that acknowledged activation,
then sends deactivation to that same node. Operations and outcomes are audited
in MySQL. Existing `CARRIER_PROVISION_URL` and
`CARRIER_PROVISION_TOKEN` remain supported as a legacy target when a carrier
has no managed nodes.

Each target must implement HTTPS JSON POST actions:
`health` -> `{"status":"healthy"}`,
`verify` -> `{"status":"verified"}`,
`activate` -> `{"status":"active"}`, and
`deactivate` -> `{"status":"inactive"}`.
The request includes `tenantId`, `provider`, adapter and trunk IDs, and
capacity/routing intent where applicable. The adapter must verify ownership,
apply configuration on the authoritative switch/provider, and return success
only after observing the resulting state. The registry scales the control
plane and planned capacity; live load distribution, SIP media, and automatic
call failover require the actual switch implementation. Health checks are
manual in the GUI until a monitoring worker is deployed.

## Operations, dashboards and training

The [user, administrator and operations manual](docs/operations-manual.md) covers registration, named tenant and personal dashboard views, drag and drop tile ordering, dark custom backgrounds, fleet grants, network device inventory, versioned desired configuration and credential-free exports. The same guide is available from the in-app Help center.

The super administrator fleet screen manages approved FreeSWITCH installation, health, upgrade and dedicated switch nftables policy jobs through a private Ansible controller. It also stores router, firewall and load balancer inventory and configuration drafts; vendor-specific apply/rollback is not available. Registration policy can close public signup or restrict email domains. Healthy WSS discovery targets can be selected by region and weight for new browser connections; this is not SIP 3xx redirection or call failover.

Named dashboard views and up to eight quick links are scoped to a tenant or user. A keyboard command palette (Ctrl/Command K) searches visible pages; previously saved links are filtered against current access. Tenant administrators can publish shared views and control personal overrides. Fleet grants expose shared infrastructure across tenants, so grant them only to trusted operators. API capacity controls still scale only 1–4 API replicas on a single Docker Compose host; MySQL and media are not clustered.

### Workspace planning and announcements

The workspace includes scheduled and parked tasks and events with tenant-limited sharing and change history. Administrators can create scheduled in-app announcement campaigns and process selected campaigns in batches. Super administrators can announce across tenants. Users acknowledge messages in the Announcements inbox. The mobile release console also supports atomic batch approval, reopening, and archiving of internal release records; it does not build binaries or submit to app stores.

Local account passkey requirements can be set at tenant, group, and user levels. Required users enroll and sign in with a user-verified WebAuthn credential. LDAP policy stays with the directory provider. See `docs/operations-manual.md` for the operating flow.

## Copyright

Copyright © 2026 Olamide Olatayo Bello. All rights reserved. The original Sip application code and documentation are not offered under an open-source license in this repository. Third-party packages, fonts, images, and other components retain their own licenses; review their notices before redistribution. See [COPYRIGHT.md](COPYRIGHT.md).

### Trunk management

Tenant administrators can create, edit, inspect, export, and delete PBX trunk plans, review their audit history and linked dependency counts, and update up to 50 preview states atomically. Revision checks reject stale edits. Active carrier-linked trunks must be deactivated through the carrier adapter before changing endpoint settings. Saving a plan or toggling its preview state does not provision, register, or disconnect a live SIP trunk; see the operations manual for commissioning steps.

### Carrier API credentials

The super admin Carrier provider commissioning page stores Flowroute access and secret keys or a DIDWW API key and sandbox/production environment for the selected tenant. Set a stable `PROVIDER_CREDENTIAL_KEY` (32 random bytes encoded as 64 hex characters) in the API container environment before saving credentials. Keep it in server secrets, never in Git. Losing or changing this key makes stored ciphertext unusable; restore the original key or replace the provider credentials through the GUI. The browser sees status, revision and update time, never the saved secret.

Create, replace, enable, disable and remove operations are tenant scoped and audited. Disabling a stored entry blocks use of that provider even if legacy environment credentials remain configured. Inventory verification and number search use the selected tenant's stored credentials; the DIDWW management proxy also uses its stored key. DIDWW callbacks still require their separate tenant binding and callback secret. Carrier activation, account routing, and a live call require their own commissioning checks.

### Kamailio adapter node configuration

Super administrators can select an enabled switch node, save its SIP domain and planned concurrent call capacity, and inspect the revision history. The database records a staged configuration with optimistic revision checks. The host monitor reports recent Kamailio and RTPengine service states, and the private runner can queue a loopback SIP challenge test. Saving a node configuration does not render or deploy the host's Kamailio configuration. Use the isolated pilot, syntax validation and actual call testing before putting traffic on a node.

### WSS load balancer and discovery

Under Super admin → Operations, configure the WSS discovery policy, create or edit weighted targets, view the linked host and health, enable or disable a target, delete it, and preview the choice for the current account and a region. Policy controls include an overall enable switch, sticky per-account selection or one-minute rotation, and an option to include global targets in regional selection. Saves use a revision check and append policy history. Target changes appear in the operations audit.

Discovery returns only enabled targets attached to fresh healthy switch nodes. The policy is used by `/api/account/redirector` for browser WSS discovery. It is not a SIP load balancer, a media relay, high availability across hosts, or an external proxy configuration. For live failover, commission multiple real switch nodes and test registration and calls.

### Trunk management updates

The PBX trunk list now has name, host and transport search, a detail view with linked carrier profiles and rates, and the existing edit, history, export, batch preview enable/disable and guarded delete actions. Trunk toggles update planning state only. Carrier activation through the private adapter and live SIP verification remain separate.

### SIP and carrier commissioning gate

To deploy the current branch's production web and API while leaving carrier
routing uncommissioned, first stop the disposable pilot API so it releases
`127.0.0.1:18080`. Review the branch and run
`bash deploy/kamailio/deploy-production-gui.sh` as root from the staging
checkout. The script confirms the existing Compose project, backs up the
production MySQL database, builds the branch's API and web images, runs its
schema migration, checks the private API health endpoint, and attempts to
restore the prior application build if health fails. It does not change
Kamailio or RTPengine. The super admin can then enter carrier and trunk
settings in the GUI; saving settings does not activate SIP peering.

`deploy/kamailio/production.yml` accepts reviewed production Kamailio and
RTPengine files for a later controlled activation. The playbook rejects the
loopback staging adapter and requires a carrier endpoint in the Kamailio
configuration. It cannot generate provider-specific SIP peering from an API
credential or from an empty GUI profile.

`deploy/kamailio/carrier-prepaid.yml` adds a local commissioning gate around
that activation playbook. Supply real `production_public_ip`, absolute
`production_kamailio_config` and `production_rtpengine_config` paths, the
assigned `production_carrier_endpoint`, and nonempty carrier and prepaid test
reports (`carrier_acceptance_report`, `prepaid_acceptance_report`). Set
`production_carrier_profile_reviewed=true` and
`carrier_prepaid_cutoff_reviewed=true` only after checking the actual trunk and
switch behavior. It checks for route, prepaid, dialog timeout and media wiring,
parses Kamailio, then installs the reviewed files and starts the services using
`production.yml`. The check does not create a trunk, fund subscribers, verify
carrier acceptance, or enable the API's live charging flags. Test a real
authenticated call and its timeout and settlement before setting those flags.
The current staging adapter does not satisfy this gate.

For a controlled **core-only** activation before any carrier is provisioned,
`deploy/kamailio/activate-core.yml` accepts private, reviewed SIP and RTPengine
configuration files. Set `production_public_ip`,
`production_kamailio_config`, `production_rtpengine_config`, and
`core_network_reviewed=true`. The SIP configuration must listen on the public
address, use RTPengine, and explicitly return `Carrier route not commissioned`
for outbound carrier calls. The RTPengine control socket must bind to
`127.0.0.1:2223`. The playbook checks the private API, parses Kamailio, backs
up installed configs, starts RTPengine and Kamailio, verifies their sockets,
and stops both services if activation fails. Review the firewall, media port
range and DNS before using it. It never enables live charging.

The route API returns a selected carrier SIP host, port and transport only for
an active profile with an enabled trunk and gateway. GUI provisioning alone
cannot turn this core-only activation into a working trunk: the installed
Kamailio configuration must consume that route and enforce prepaid cutoff.
Do not mark carrier peering or prepaid billing commissioned until real switch
dispatch, authenticated carrier calls, media and settlement have been verified.

The super admin **Fleet operations → Server and network operations** screen
now queues **Check and install SIP requirements** and **Activate reviewed SIP
core** for switch nodes through the private deployment runner. The core action
uses `/root/production-kamailio.cfg` and `/root/production-rtpengine.conf` on
the target, its inventory IPv4 address, and the local inventory shipped at
`deploy/kamailio/local-inventory.ini`. Prepare those files privately and review
the public listener, firewall and media range before queuing. Job history and
Kamailio service reports show the result. The old generic install and upgrade
buttons, which targeted FreeSWITCH, are retired. These controls install host
prerequisites and activate the carrier-blocked SIP core; they do not provision
the trunk from GUI drafts or mark live prepaid commissioned.

To audit and repair host prerequisites first, run this on the Debian 12 server:

```bash
cd /opt/olamide/kamailio-staging && printf '[switch_nodes]\nsip-switch-1 ansible_connection=local\n' > /tmp/olamide-kamailio-inventory.ini && ansible-playbook -i /tmp/olamide-kamailio-inventory.ini deploy/kamailio/install-requirements.yml
```

The idempotent playbook installs missing Kamailio modules, RTPengine, TLS and
billing client packages, creates private billing directories, and reports
missing checkout/environment inputs, Docker Compose, API health and SIP service
state. It does not install or replace Docker on an existing production host,
create carrier credentials, activate routing or enable live charging. Repair
reported inputs before running the gated production playbook.

Run `bash deploy/kamailio/commission-check.sh` as root from the updated staging checkout on the target Debian host. The report is read-only and lists installed packages, systemd state, private API health, installed Kamailio syntax, loopback-only listener and the carrier dispatch blocker. An exit code of zero means host checks passed; it is **not** a successful carrier call or traffic cutover.

The current `adapter.cfg.j2` binds only `127.0.0.1:5062` and deliberately returns 503 for carrier destinations. The pilot API and loopback challenge smoke test do not prove live registration, trunk authentication, RTP, NAT, inbound routing, CDR or charging. To commission external traffic, obtain the carrier's documented SIP peering details, IP allowlists or credentials, DID destinations and codec requirements; configure a public SIP edge and RTPengine network interfaces and ports; then test authenticated registrations, outbound and inbound calls, two-way audio, failover and reconciled CDRs with a real carrier test account before enabling production routing. Keep provider keys in the encrypted admin store or server secrets, not in Git.
# Prepaid administration gate

The super administrator's **Prepaid controls** page reads and saves a tenant's 1–60 minute maximum authorized call window, enabled state, and policy history. It also shows the host gate, funded account count, active reservations, and eligible rate count. The API rejects new reservations for disabled tenants and never authorizes an unbounded call.

Enabling requires both `LIVE_PREPAID_ENABLED=true` and `LIVE_PREPAID_SWITCH_VERIFIED=true` in the private API environment. Set the second flag only after the installed Kamailio configuration synchronously authorizes outbound calls, fails closed on API errors, terminates answered calls at the returned `maxSeconds`, and sends authenticated end events for settlement. The route adapter supplies the tenant, subscriber, and selected rate ID for the authorization request. The GUI does not deploy the SIP host or commission a carrier; the billing requirements playbook alone does not enable live charging.

## Combined installation and carrier gate

On the production host, fetch the reviewed branch and run the combined local playbook:

```bash
cd /opt/olamide/kamailio-staging && git fetch origin kamailio-rebuild && git switch --detach origin/kamailio-rebuild && ansible-playbook -i deploy/kamailio/local-inventory.ini deploy/kamailio/commission-all.yml
```

This repairs host prerequisites and reports missing inputs. Set
`commission_deploy_gui=true` to back up the production database, migrate it,
and deploy the GUI and API. The super admin configures a tenant trunk, carrier
profile, gateway and tariff there. The private route API selects only active
profiles with enabled trunks and gateways and returns the SIP host, port and
transport for the selected carrier and alternates.

For a carrier-blocked public SIP core, first create and review private
`/root/production-kamailio.cfg` and `/root/production-rtpengine.conf`. Then run
this single command on the host after confirming the IP and network rules:

```bash
cd /opt/olamide/kamailio-staging && git fetch origin kamailio-rebuild && git switch --detach origin/kamailio-rebuild && ansible-playbook -i deploy/kamailio/local-inventory.ini deploy/kamailio/commission-all.yml -e commission_activate_core=true -e production_public_ip=154.29.77.102 -e production_kamailio_config=/root/production-kamailio.cfg -e production_rtpengine_config=/root/production-rtpengine.conf -e core_network_reviewed=true
```

This path starts RTPengine and Kamailio only after configuration and API checks.
It deliberately returns 503 for carrier calls and leaves live prepaid disabled.
Do not combine `commission_activate_core=true` with `commission_activate_carrier=true`.

Set `commission_activate_carrier=true` only with reviewed production SIP and
media files, a real carrier endpoint and independent acceptance reports. The
guarded activation checks configuration and service state; it cannot prove
carrier peering, automatic call expiry, two-way media, settlement or billing.
The current repository still needs production Kamailio dispatch and prepaid
callback integration plus observed carrier call tests before full commissioning.

The super admin fleet screen also offers **Audit SIP and media readiness**.
The private runner executes `monitoring.yml` on the switch, records service
state, and displays the latest Kamailio/RTPengine reports. The dashboard shows
prepaid reservation counts and posted prepaid journals from MySQL. To run the
read-only host audit directly:

```bash
ansible-playbook -i /opt/olamide/kamailio-staging/deploy/kamailio/local-inventory.ini /opt/olamide/kamailio-staging/deploy/kamailio/monitoring.yml
```

These measurements expose inactive services and unsettled reservations; they
do not infer that a carrier accepted a call or that an RTP stream worked.
