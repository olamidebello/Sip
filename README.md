# Olamide SIP

Olamide is a development browser softphone with a Node.js account API and MySQL 8.4 database. See the deployment checks below for the current server state.

## FreeSWITCH and Class 5 deployment

The Debian 12 switch playbook requires FreeSWITCH 1.11.3 or newer from the SignalWire stable repository and upgrades nodes one at a time after checking for active calls and backing up configuration. A FreeSWITCH XML bridge serves tenant-scoped SIP credentials and authenticated internal/outbound dialplans from MySQL. The **Administration → FreeSWITCH** screen manages domains, tariff selection, Sofia gateway mappings, and account activation. A [Debian 12 Ansible role](deploy/ansible/README.md) installs FreeSWITCH, XML curl, WSS certificates, local event socket protection, node telemetry, time synchronization, optional TURN, and a configurable switch firewall. Multiple hosts can share the backend.

This is an installable switch foundation, not a completed carrier-grade Class 5 service. The role needs a SignalWire package token, trusted WSS certificate, private network API URL, SIP carrier settings, and vaulted secrets. It has not been deployed to a server. Public DID ingress, live CDR rating, prepaid enforcement, concurrent call limits, emergency routing, fraud settlement and regulatory controls require further implementation and acceptance testing.

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

This repository contains a browser SIP dialer, a MySQL-backed account API, and administration screens. The PBX, queue, DID routing, and rate deck screens **save and preview configuration**; they do not provision a SIP switch or handle media. Neither a plan invoice nor a previewed rate is a charge. A SIP account must come from an external WSS/WebRTC capable switch. This distinction is shown in the interface and API response.

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

The primary bootstrap deploys only the web/API/MySQL stack. To **stage** a FreeSWITCH package on the same Debian 12 host, obtain a SignalWire Personal Access Token for the official package repository. Put the token in `/etc/olamide/signalwire-token` as root with mode 0600. From the cloned repository, run `OLAMIDE_SWITCH_STAGE=1 OLAMIDE_DOMAIN=sip.dobhrap.com bash deployment/bootstrap.sh`. The bootstrap installs the validated web/API version, then runs `deployment/ansible/switch.yml`. A remote Ansible controller can run `SIGNALWIRE_TOKEN=... ansible-playbook -i 'SERVER,' -u SSH_USER deployment/ansible/switch.yml` using a private secret mechanism instead of writing a token into shell history.

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

The **Authentication providers** panel displays the current tenant's local-password and LDAPS states. A super admin can enable or disable local sign-in for a selected tenant and decide whether tenant administrators may manage the LDAP enable switch and group mappings. Tenant administrators can view the policy but cannot edit it; when LDAP management is locked, they cannot change LDAP mappings. The original Olamide tenant always retains local super-admin recovery. For another tenant, local sign-in can be disabled only after the server connection is configured, LDAP is enabled, and at least one directory group is mapped. Disabling local sign-in revokes that tenant's local-user sessions; enabling it again permits existing local accounts to sign in. The API is `GET/PUT /api/admin/auth-providers` in the selected tenant context; policy changes are audited. These are two built-in provider integrations, not a facility for uploading and executing arbitrary authentication plugin code.

LDAPS is the network authentication method implemented here. It authenticates users against a configured directory and maps direct `memberOf` group DNs to Olamide groups. It does **not** provide RADIUS/802.1X network admission, OIDC/SAML single sign-on, Kerberos, VPN authentication, or native device enrollment. A directory outage prevents new LDAP sign-ins, and the one-hour session limit remains as described above.

### Install on desktop and mobile

The web frontend is an installable Progressive Web App. The deployed HTTPS site serves `/manifest.webmanifest`, 192- and 512-pixel Olamide icons, and a service worker. On Chrome or Edge desktop or Android, visit `https://sip.dobhrap.com/` and select **Install Olamide** if the browser offers it; otherwise use the browser's **Install app** menu. On iPhone or iPad, open the site in Safari and use **Share → Add to Home Screen**. Launch the installed icon for a standalone app window. The install panel shows platform guidance when an automatic prompt is unavailable. You can also use the site normally without installing it.

The offline page explains that a network connection is required. The service worker caches public shell assets and immutable built JavaScript/CSS; it never caches `/api/` requests or account data. Calling, LDAP sign-in, messaging, billing, and administration require an active server connection. This PWA is **not** a packaged Windows/macOS/Linux binary, an Android APK, or an iOS App Store application. It does not add background SIP wakeup, native call integration, mobile push notifications, or offline calling. Native installers and store publishing remain separate work requiring signing credentials, platform entitlements, and native integration.

### Optional TURN relay for meetings

The Compose stack includes a **disabled by default** coturn profile. On the Debian host, verify that `sip.dobhrap.com` resolves to its actual public IPv4 address and that the host can accept TCP and UDP port 3478 plus UDP ports 49160–49260. Use the actual address from your provider console; a server IP written in project notes is not a substitute for checking the deployed host. In `/etc/olamide/secrets.env` set `TURN_PUBLIC_HOST=sip.dobhrap.com`, `TURN_PUBLIC_IP=YOUR_VERIFIED_PUBLIC_IPV4`, a newly generated `TURN_SECRET` of at least 32 random characters (for example `openssl rand -hex 32`), and `COMPOSE_PROFILES=turn`. Keep this file mode 0600. Re-run bootstrap or the validated update service and inspect `docker compose --profile turn ps` in `/opt/olamide/repo/deployment/docker`. The API and coturn must use the same secret. After commissioning, join a meeting from two different networks and inspect the WebRTC candidate pair to verify that a `relay` candidate is selected when direct connectivity fails.

`GET /api/meetings/config` gives authenticated participants one-hour coturn REST credentials generated by the API, without exposing the shared secret. The relay uses UDP/TCP TURN on 3478; TURN over TLS on 5349 is not configured. Keep firewall rules limited to the listed ports and provision enough relay bandwidth and ports for the intended concurrency. This profile is for the four-person web meetings; it does not configure SIP WSS, media routing in FreeSWITCH, or an SBC. A successful container start does not prove audio connectivity across provider networks.

### Bare Debian installation and Ansible automation

On a fresh Debian 12 host, create the public A record first and confirm it resolves to the address shown in the server provider console. Use the single entrypoint in the preceding guide, `deployment/install-all.sh`. It installs minimal prerequisites, obtains the repository, verifies DNS, and calls the existing installer. If you already cloned the repository, you can also run its lower-level installer:

```bash
apt-get update && apt-get install -y ca-certificates git
git clone https://github.com/olamidebello/Sip.git /root/Sip
cd /root/Sip
OLAMIDE_DOMAIN=sip.dobhrap.com OLAMIDE_PUBLIC_IP=YOUR_VERIFIED_PUBLIC_IPV4 bash deployment/install.sh
```

`deployment/install-ansible.sh` installs Debian prerequisites, Ansible, and its dependencies. `deployment/install.sh` checks public DNS before running the existing bootstrap. Bootstrap installs Docker and Compose with Ansible, generates private database passwords, selects a successfully validated main commit, and brings up the web/API/MySQL stack. Rerun the installer to apply a validated update; the scheduled update service also checks for validated main commits. Inspect `/etc/olamide/secrets.env`, `journalctl -u olamide-compose`, and `docker compose ps` in `/opt/olamide/repo/deployment/docker` during commissioning. Keep a console recovery path, backups, and firewall access to HTTPS. This automation does not configure the carrier switch or create DNS records.

### Wallet foundation

Billing users can see their USD wallet balance and activity and submit a peer transfer to an active account in the same tenant. `POST /api/wallet/transfers` accepts `{ "recipientEmail": "person@example.com", "amountCents": 100, "idempotencyKey": "UUID" }`. Each transfer locks both accounts in a MySQL transaction, rejects insufficient funds, records two ledger entries, and returns the same result for an identical request ID. Account balances start at zero. There is no authorized wallet funding path, bank linkage, payout, cash card, dispute handling, KYC, or switch-level prepaid enforcement; transfers cannot execute until a separately reviewed funding integration credits a balance. Do not insert wallet balances manually or treat the UI as a live money service.

### Dashboard, navigation, and contact batches

The application navigation links to the sections available to the signed-in role and feature groups. The dashboard provides shortcuts to those sections. A tenant administrator can order and choose default tiles under **Administration → Tenant dashboard defaults**, and can allow or lock personal layouts. A signed-in user can order and select available tiles under **Dashboard → Customize my dashboard**, or restore the tenant layout. `GET/PUT /api/dashboard` and `PUT /api/admin/dashboard` store settings in MySQL and enforce role and tenant permissions. **Refresh dashboard** loads tenant-scoped app counts from `GET /api/dashboard/summary`: account messages and contacts, unpaid invoices, hosted rooms, and administrator tenant users where allowed. These are app records, not live switch, payment, or carrier telemetry. The tiles are navigation shortcuts, not a general widget framework.

Under **Messages**, import a UTF-8 CSV with an `email` header (other columns are ignored), up to 500 rows and 64 KB. Every address must match an active account in the same tenant; if one is missing, the entire batch is rejected. Existing contacts are safely ignored. The **Export contacts CSV** button downloads the signed-in user's contact names and emails. The authenticated `POST /api/contacts/import` route repeats the tenant and row validation on the server; users need messaging permission. Imported contacts do not create user accounts, send invitations, or import message histories. The API returns at most 1,000 contacts; remove or paginate records if the deployment needs a larger address book.

### Search and technical support

Sign in and use **Search** to search accessible tickets, your own contacts, and published plans in the current tenant. Choose a category or **All**; the query must contain 2–100 characters. `GET /api/search` returns at most 20 matches per category with server-side tenant and feature checks. Search is a bounded app-record lookup, not full-text indexing of call recordings, server logs, or carrier data.

Under **Technical support**, submit a ticket with a subject, category, and description. Search and filter the ticket list by keywords, status, or priority; use **Previous page** and **Next page** for 25 results at a time. Open a ticket to read the conversation and status history, post a reply, and refresh the list. Users can see only tickets they created in the selected tenant. Tenant administrators can see all tenant tickets, set status and priority, assign an active tenant administrator, and post internal notes that ticket requesters cannot read. Closed tickets must be reopened before posting a reply. The API is under `/api/support/tickets`; mutations enforce these permissions and retain a status-change history. Support tickets do not send email, SMS, push notifications, or open a remote support session. Staff must monitor the console; assignment alone does not alert the assignee.

### Language, country, and currency preferences

Sign in and open **Locale** to choose a language, country or territory, and preferred currency, then **Save my preferences** or **Use tenant defaults**. Administrators can set tenant defaults under **Administration → Locale defaults**. `/api/locales/catalog` exposes the runtime's recognized language codes and currency codes plus the ISO 3166 alpha-2 territory catalog; `/api/locales` and `/api/admin/locales` persist validated selections in MySQL. The current catalog has 1,069 language codes (including aliases), 249 territories, and 162 currency codes on the bundled Node runtime; available currencies can vary with ICU updates. These are preferences, not a translated interface or foreign exchange system. The UI remains in English. App-side USD displays use the chosen language's number formatting; the selected currency does not convert invoices, wallet balances, plan prices, or payments. Country selection does not verify legal residency, available numbering rights, or service eligibility.

### Live telecom and financial commissioning gates

The current FreeSWITCH playbook **stages packages and leaves the switch stopped**. The PBX API stores tenant scoped extensions, queues, DID destinations, trunk intent, rates, and preview policies; it does not yet generate a live FreeSWITCH directory or dialplan. Do not start a public SIP service from this repository as if the stored settings were active. Live WSS registration needs a commissioned SIP profile with trusted TLS, provisioned SIP users and credential lifecycle, verified tenant routing, trunk authentication, media/NAT configuration, and an SBC or equivalent ingress controls. FreeSWITCH [mod_xml_curl](https://developer.signalwire.com/freeswitch/integration/xml-curl/) can fetch directory and dialplan XML from an authenticated backend, while [mod_callcenter](https://developer.signalwire.com/freeswitch/applications/call-queues/) supplies live ACD, and [mod_voicemail](https://developer.signalwire.com/freeswitch/applications/voicemail/) needs recording storage and a delivery service. Those integrations, recording consent and retention rules, queue SLA event capture, and an operator wallboard are not implemented here.

The CDR API accepts signed, idempotent **normalized** records from a configured source but does not subscribe to FreeSWITCH events or rate, settle, reconcile, or charge them. Plan and DID invoices can be paid through an enabled Stripe Checkout gateway; payment does not fulfill or provision an order. Before activating prepaid calling, implement jurisdiction-specific tax calculation, an immutable ledger, real-time balance reservation and call cutoff at the switch, fraud limits, and carrier invoice reconciliation. Do not credit a wallet from a browser success message or treat the current route preview as a fraud or balance control.

Commissioning the server also requires authorized SSH/console access, public DNS control for `sip.dobhrap.com`, the provider's actual interconnect and account credentials, and production firewall rules. The deployment playbook verifies public HTTPS and DNS when run against the server, but this repository cannot change a DNS zone or supply external credentials. Confirm each dependency and perform end-to-end call, failure, emergency routing, payment, tax, CDR, and recovery tests before advertising live service.

### Downloadable clients

The landing page lists the latest published preview files from GitHub Releases. The Android debug APK includes a native carrier privilege check and a user-confirmed **Set Olamide display name / Restore carrier name** control under **Carrier partner integration**. On ordinary SIMs it reports that the APK is unauthorized and changes nothing. The native bridge targets the default SIM. Android default phone role, cellular calling and emergency calling are not implemented.

For an operator-authorized APK, first have the carrier authorize the **release signing certificate** on the intended SIM/eSIM profiles. Configure GitHub Actions secrets `CARRIER_KEYSTORE_B64` (base64 of the JKS, without line breaks), `CARRIER_KEY_ALIAS`, `CARRIER_KEYSTORE_PASSWORD`, and `CARRIER_KEY_PASSWORD`. The package workflow then assembles and verifies `olamide-carrier-signed.apk` and publishes it alongside the preview downloads. Keep keys out of Git and distribute the signed APK only after physical-device validation. Merely signing the APK does not grant carrier privileges; the installed SIM must recognize the exact signing certificate. See [carrier integration requirements](apps/web/public/carrier-partner.md).

The [Releases page](https://github.com/olamidebello/Sip/releases) provides downloadable builds when a `v*` tag has passed the package workflow. The [Downloadable Olamide apps workflow](https://github.com/olamidebello/Sip/actions/workflows/packages.yml) also exposes build artifacts for each successful run (GitHub sign-in may be required for Actions artifacts). Files include a browser ZIP of the built static client, Linux AppImage, Windows `.exe`, macOS `.dmg`, and an Android debug `.apk`. The browser ZIP must be hosted with the API at the same HTTPS origin; opening `index.html` from disk does not connect to the backend.

The desktop client in `apps/desktop` uses an isolated, sandboxed Electron window restricted to `https://sip.dobhrap.com`, with microphone and camera permissions for that origin. The Android package in `apps/mobile` is a Capacitor WebView loading the same HTTPS site, so sign-in and API calls share the hosted origin. Both require a running backend, DNS and trusted HTTPS. They do not bundle a PBX or work offline. Capacitor documents remote `server.url` for live reload rather than production; this Android debug build is an evaluation package, not a production app or Play Store submission. Test device audio, SIP over WSS, session persistence, links, and permissions before any production packaging. Do not install debug builds on devices you do not control.

For iOS the workflow builds an **unsigned simulator app** as an Actions artifact. It cannot be installed on a physical iPhone. To create a device build, use a Mac with Xcode and an Apple development team, run `cd apps/mobile && npm install && npx cap add ios && npx cap sync ios`, open `ios/App/App.xcodeproj`, configure bundle signing, and archive or run on a connected device. Apple distribution and store review require separate signing and app review; no signed IPA is published here. The Windows and macOS installers are also unsigned and may show operating system warnings. Android carrier release signing runs only when the four signing secrets are configured; Play Store distribution is not configured.

To regenerate packages, use the workflow's **Run workflow** button or push package changes to `main`. After all package builds succeed, the workflow publishes a public preview release (`v0.1.0-preview.<run number>`) with direct download links; a pushed `v*` tag creates a release with that tag instead. Do not treat a successful build as proof of calling behavior on a physical device. Source build commands: `cd apps/web && npm install && npm run build`, `cd apps/desktop && npm install && npm run dist`, and `cd apps/mobile && npm install && npx cap add android && npx cap sync android && bash install-carrier-native.sh && cd android && ./gradlew assembleDebug` with Android SDK and JDK 21 installed.

### DID and plan purchase controls

1. Sign in as a super admin, switch to the intended tenant in **Administrator → Tenant management**, then use **DID, plan, and tenant role controls**. Six switches independently enable user plan requests, user DID requests, tenant admin plan edits, tenant admin pricing edits, tenant admin in-house DID management, and tenant admin user/group changes. These policies are stored per tenant and enforced by the API on every protected write; a super admin can recover and change them. Tenant admins can view but cannot modify the switches. The existing `admin` role is the tenant administrator for the selected tenant; ordinary `user` access to billing still depends on its feature group. Super admins can switch tenant context, while tenant admins remain in their own tenant. This is the implemented role matrix, not a general custom role editor across every module.
2. Tenant admins with plan editing enabled can create a plan and publish or hide it from the **Plan catalog**. `GET/POST /api/admin/plans` and `PUT /api/admin/plans/:id` are tenant scoped. Changing a plan's current price changes the catalog price; it does not charge subscribers or retroactively modify prior invoices. Users with billing access request an active plan. The backend creates an unpaid invoice and a `pending_payment` subscription; it does not collect a payment or activate service.
3. Set Flowroute, DIDWW, and in-house selling rules under **DID pricing**. Imported in-house inventory must be verified and explicitly published before a user can reserve it. A user reservation creates an unpaid setup invoice and holds the in-house number for 24 hours; it does not provision a route.
4. For Flowroute or DIDWW, a user searches live inventory and clicks **Request DID**. The backend rechecks that provider's listing and recalculates tenant pricing, then atomically saves a `pending_payment` request and unpaid setup invoice. Users can review requests under **My number requests**; tenant administrators can review them under **Provider DID requests for review**. `POST /api/numbers/request`, `GET /api/numbers/requests`, and `GET /api/admin/numbers/requests` are tenant scoped. This **does not reserve or order the DID from the provider**, guarantee its availability after the search, charge a card, activate monthly billing, or provision SIP service. A carrier ordering and payment integration with credentials, webhook verification, idempotency and reconciliation is required for a completed purchase. The provider catalog may change between request and fulfillment.
5. `GET /api/catalog-policy` returns a signed-in user's purchase permissions. `GET/PUT /api/admin/catalog-policy` reads or updates the six controls, with PUT restricted to super admins. The UI disables request controls for policies that disallow them; the backend independently rejects prohibited writes. Audit events record policy and plan changes. Existing tenant admin LDAP controls remain under **Authentication providers**.

### Reports and analytics

1. Open **Administrator → Reports and analytics**, choose inclusive UTC start and end dates (up to 366 days), then select **Run report**. The report is generated from MySQL for the tenant currently selected in your admin session. Tenant administrators see only their own tenant. Super admins must switch tenant context to review another tenant; this endpoint does not aggregate across tenants.
2. Review daily call counts, answer rate, duration and billable seconds, dispositions, directions, CDR sources, traffic by UTC hour, invoice count and recorded amounts separated by currency and status, port requests, new users, and current DID and PBX agent states. Missing days have no ingested calls. The inventory, total user, and agent figures are current snapshots; the other figures use the selected date range.
3. Download **daily calls CSV** or **invoice summary CSV** for external analysis. API endpoints are `GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` and `GET /api/admin/reports.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=calls|invoices`. Authentication and administrator role checks apply to both. CSV output contains aggregate data, not customer phone numbers. Recorded CDRs depend on configured ingestion and may not represent every switch event. An invoice marked paid is a database status, not independently reconciled cash receipt. No scheduled reports, provider settlement, live switch telemetry, queue event timing, or revenue recognition engine is implemented.

### Dynamic backgrounds

1. In **Administrator → Tenant background policy**, choose day and night presets (`Midnight`, `Ocean`, `Aurora`, `Sunrise`, or `Slate`). Optionally switch at 6 AM and 6 PM based on each device's local time and enable gentle movement. Clear **Allow users to choose their own background** to enforce the tenant setting. Save the policy for the currently selected tenant. The change is audited.
2. Under **My background**, signed-in users can save their own settings when allowed, or choose **Use tenant background** to remove their personal override. A locked policy takes effect on the next background refresh or sign-in. The browser checks the local hour each minute. `prefers-reduced-motion` disables movement regardless of the saved animation preference.
3. Settings are persisted in MySQL through `GET/PUT/DELETE /api/background` and administrator `GET/PUT /api/admin/background`. Only the five built-in gradients are allowed. No user-supplied CSS, uploaded image storage, remote image loading, device-wide wallpaper control, or instant push to other open tabs is implemented.

### PBX extension and queue configuration

1. Create each **extension** with a unique 2–10 digit number, display name, optional assigned user, voicemail intent, and optional forwarding target. A number cannot also be a queue number in the same tenant. The user's **Call center agent** panel displays their assigned extension. Creation saves database intent; it does not provision a SIP device, password, voicemail box, or switch dialplan.
2. Create a **queue** with a number, name, strategy (`ring_all`, `ordered`, `longest_idle`), and maximum wait time. Select the queue, check its tenant users, and save members. Grant the `Call center agent` group feature to the intended agents. Agents set their own manual availability to `ready`, `away`, or `offline`. **Preview eligible agents** computes the next agents from this status and the queue order. It does not ring phones. `longest_idle` uses the last manual status change, not a verified call idle time.
3. Under **Inbound DID routing**, enter an E.164 DID and select a saved extension or queue. This maps the number to a destination in MySQL. You must separately configure your carrier and a live PBX to deliver the DID; no carrier order or dialplan update is sent.
4. Add a **trunk plan** with name, host, port, transport and priority. The button labeled **Enable for preview** includes the trunk in simulation only. Credentials are deliberately not stored in the trunk table. Add prefix rates in integer cents per minute with selling price at least cost; then preview an outbound E.164 number. The preview selects the longest matching prefix, lowest cost, then trunk priority. No outbound call or real-time balance authorization occurs.
5. The PBX API also exposes `GET /api/pbx/overview`, `/extensions`, `/queues`, `/inbound-routes`, `/trunks`, `/rates`, and `/route-preview?number=%2B12125550123`. All admin mutations require a signed-in administrator and the browser's configured origin. Agent status and an assigned extension are accessible to the signed-in user. Use the browser interface for routine work.

### Plans, numbers, communication, and mobile releases

- Create monthly plans and review unpaid invoices. Plan selection creates a pending invoice; a separate payment processor, tax engine, and settlement reconciliation are required. In **DID buying and selling prices**, configure a separate Flowroute, DIDWW, and in-house rule. The default provider rule is +30%; a legacy tenant markup setting remains the fallback until a source rule is saved. Flowroute/DIDWW buying costs come from the provider inventory feed and cannot be changed at the provider by this application. Choose percentage adjustment (signed basis points, such as `3000` for +30% or `-1000` for -10%), fixed cent adjustment (positive or negative), or manual final setup and monthly selling prices. Preview calculations before saving. Decreases stop at zero. API: `GET /api/admin/pricing` and `PUT /api/admin/pricing/{flowroute|didww|inhouse}` with `mode`, integer `setupValue` and `monthlyValue`. Rules are tenant scoped and audited. Flowroute/DIDWW searches need provider API keys in the server environment. Purchase and number port submission remain disabled.
- In **In-house DID management**, filter inventory by number prefix and status, then choose **Set buy/sell price** on an individual unverified, available, or disabled number. Enter estimated buy setup/monthly cents, manual sell setup/monthly cents, and select manual or **Follow in-house rule**. For rule-managed numbers, search and reservation compute the selling prices from the stored buy costs and current rule; the reservation snapshots setup and monthly prices and creates an unpaid invoice at the computed setup amount. A rule change affects future reservations; existing invoices are not repriced. Reserved or assigned numbers cannot be edited through this control. The administrator must verify actual acquisition cost independently. This is a price record and reservation flow, not automatic provider purchasing or recurring charge collection.
- Add contacts in the same tenant, send server-stored messages, and use meeting rooms with up to four participants. Meeting chat is temporary; screen sharing uses the browser's screen capture. Pointer assistance is an overlay and cannot operate the remote desktop. Configure TURN for cross-network calls. Messages have no end-to-end encryption or push delivery.
- Android/iOS release administration records app identifiers, artifact references, tracks, internal approval, and audit history. It does not build native clients or submit to Google/Apple stores.

## Integration work required for a live PBX or ASTPP-class service

Choose a licensed and supported switch (for example Asterisk/FreeSWITCH with an SBC and a suitable provisioning layer) and implement tenant-isolated provisioning for PJSIP credentials, TLS/WSS, dialplan, queue engine, voicemail, inbound/outbound carrier routing, emergency calling policy, media/RTP, and CDR ingestion. Require reconciliation and idempotency between the Olamide database and the switch. Add per-tenant carrier credentials, explicit route activation, number ownership checks, fraud limits, call recording consent and storage policy, and monitoring before enabling trunk traffic. For ASTPP-like charging, add authoritative CDRs, prefix effective dates, rounding rules, taxes, prepaid credit reservation, low-balance interruption, dispute adjustments, and audited settlement. For 3CX-like call center operation, add live queue distribution, presence tied to registration and calls, SLA measurement, callbacks, recording, reports, and supervisor controls. The current queue and LCR endpoints are safe previews for that implementation, not an operational substitute.
# Form pages and account registration

Forms have direct browser routes under `/pages/<form-id>`. For example,
`/pages/signup`, `/pages/login`, `/pages/ldap-login` and `/pages/support-create`.
The application navigation lists forms beneath their workspace section. Browser
back and forward navigation and direct reloads use the same route; Caddy serves
the web application for these paths.

Registration submits to `POST /api/register`. The API validates and normalizes
the account, hashes its password with scrypt, and inserts the user and default
group membership in a single MySQL transaction. Sign-in uses `POST /api/login`
and an HttpOnly session cookie; directory sign-in uses `POST /api/login/ldap`.
Registration creates an application account only. Carrier onboarding still
requires verified identity, carrier authorization, number assignment, SIP
credential provisioning, and operational fraud controls before calling access
can be enabled. Do not treat a newly created account as a provisioned carrier
subscriber.

## Automatic MySQL creation and migrations

On a fresh Docker volume, the MySQL container creates the database and
application account from `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` and
`MYSQL_ROOT_PASSWORD` in the private deployment environment file. The
`migrate` container then creates and updates tables for accounts, tenants,
permissions, PBX, CDRs, DIDs, Nigeria interconnect records, billing, wallet,
support and the other implemented API modules. The API starts only after this
job succeeds, and also reruns the idempotent migrations at startup for local
development. A MySQL advisory lock serializes migration attempts. Applied
components are recorded in `schema_components`.

For a fresh server, run the documented `deployment/install-all.sh` command.
For a normal update, run `bash /opt/olamide/repo/deployment/update.sh`; it backs
up MySQL before updating and lets Compose execute the migration job. To run
the job manually from `/opt/olamide/repo/deployment/docker`:

```bash
docker compose run --rm migrate
docker compose exec -T mysql sh -c 'exec mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT component,applied_at FROM schema_components ORDER BY component"'
```

Do not delete the `mysql_data` volume during updates. MySQL's initial database
and user creation runs only for a new data directory. If a preexisting external
MySQL server lacks the configured database or grants, create them with
`services/api/create-database.sql` and an administrator credential first.
These migrations create data structures for implemented software features;
external carrier, clearinghouse and payment services still need credentials,
agreements and provisioning.

## Verified signup, passkeys and SIP provisioning

The registration page collects a full name, email, E.164 phone number and
address. Configure `RESEND_API_KEY`, `RESEND_FROM` (a verified sender) and a
random `OTP_HMAC_SECRET` of at least 32 characters in
`/etc/olamide/secrets.env`, then rerun bootstrap to install the updated private
environment file. Registration is unavailable until email delivery is
configured. New accounts have `pending_email` status and cannot sign in. The
API sends a six-digit email code that expires after 10 minutes; verification
activates the account. Five incorrect attempts exhaust a code; resend is
limited to once per minute and creates a fresh code. The MySQL migration adds
`user_profiles`, `signup_otps`, `passkeys` and `passkey_challenges`.

Signed-in local users can add a WebAuthn passkey in **Account & security**.
The passkey can then be used on the sign-in page. Device biometric or PIN
verification remains on the device: the server stores the public key and
counter, checks origin, relying party ID and a one-use challenge, and requires
user verification. Use HTTPS with the final app domain. Losing all passkeys
does not remove password access. An administrator should configure recovery
and phishing-resistant administrator policies before relying on passkeys as
the only sign-in method.

Email verification also creates a tenant-scoped `sip_accounts` record with a
unique authorization username. Set a random 64-character hex
`SIP_CREDENTIAL_KEY` so the generated SIP password can be encrypted at rest.
If a commissioned switch adapter is available, set `SIP_PROVISION_URL` to its
HTTPS endpoint and `SIP_PROVISION_TOKEN` to its private bearer token. The API
POSTs `{accountId,tenantId,userId,username,password,domain}` with an
`Idempotency-Key` header and marks the account `active` only after the adapter
returns JSON `{ "status": "active" }`. The adapter must provision the user on
the authoritative switch and enforce tenant isolation before acknowledging.
Without it, the record remains `awaiting_switch` and cannot make calls. The
account page displays that status; an active user's SIP credentials require
password reauthentication to reveal. Existing accounts are not retroactively
assigned credentials by this new signup hook.

**Dial plan marketplace** lets administrators create draft or published offers.
Users browse published offers and request one. The request and unpaid invoice
are created together in MySQL; this is a purchase request, not a live routed
dialplan, recurring charge or payment confirmation. The server still needs
switch activation, billing authorization, fraud controls and reconciliation
before the offer can route calls.

## Carrier provider commissioning and ASTPP-style controls

In **Administration → Carrier providers**, an administrator selects an existing
tenant trunk, a concurrent call capacity, and a routing intent for Flowroute
or DIDWW. The server stores the profile in `carrier_provider_profiles`. The
**Verify inventory API** action checks the provider's private server
credentials without showing the key in the browser. Credentials remain in
`/etc/olamide/secrets.env`. **Provision with switch adapter** requires
`CARRIER_PROVISION_URL` (HTTPS) and `CARRIER_PROVISION_TOKEN`; the adapter
receives `{tenantId,provider,trunkId,maxConcurrentCalls,routingMode}` with an
idempotency header. Only a response `{ "status": "active" }` marks the tenant
profile active. Provider DID search and request endpoints reject providers
that have not been activated. Changing a profile returns it to draft and
requires a new adapter acknowledgment. The adapter must enforce trunk
configuration, capacity and routing on the actual switch; saving a profile
does not change a running switch.

**Administration → Charging operations** shows tenant counts for imported
unrated CDRs, enabled preview rates, unpaid invoices, pending dial plan
requests, active carrier profiles, and USD wallet liabilities. It links to
the underlying administration screens. Amounts from other currencies are
excluded from the USD totals.

The existing PBX rate deck, outbound policy preview, DID price rules, tenant
management, normalized CDR ingestion, wallet transfer ledger, invoices and
reports provide parts of an ASTPP-style administrative control plane. They
are not an ASTPP deployment or a carrier-grade charging engine. Live LCR,
rating, prepaid reservation and cutoff, tax, settlement, reseller accounting,
fraud detection and reconciliation require authoritative switch events and
carrier agreements. Do not turn on paid traffic based on preview data.

### Flowroute messaging callbacks and external SMS

Olamide accepts four Flowroute account callback types at private, tokenized HTTPS URLs. After a validated update, sign in as the administrator for the carrier tenant and open **Administration → Messaging webhooks** to copy the four full URLs. In Flowroute Manage → Messaging Webhooks, paste the corresponding URL into **SMS**, **MMS**, **SMS DLR**, and **MMS DLR**, enable each and save. The public URL shapes are:

| Flowroute field | Olamide URL shape |
| --- | --- |
| SMS | `https://sip.dobhrap.com/api/webhooks/flowroute/<PRIVATE_TOKEN>/sms` |
| MMS | `https://sip.dobhrap.com/api/webhooks/flowroute/<PRIVATE_TOKEN>/mms` |
| SMS DLR | `https://sip.dobhrap.com/api/webhooks/flowroute/<PRIVATE_TOKEN>/sms-dlr` |
| MMS DLR | `https://sip.dobhrap.com/api/webhooks/flowroute/<PRIVATE_TOKEN>/mms-dlr` |

The private token is generated into `/etc/olamide/secrets.env` on bootstrap or first validated update and copied to the Compose environment. Do not paste it into tickets or public repositories. For a manual install, use `openssl rand -hex 32` as `FLOWROUTE_WEBHOOK_TOKEN` and restart the API. An administrator with access to the carrier tenant can see and copy the complete URLs on the Messaging webhooks page. The callbacks require this token, accept Flowroute JSON API content, store events idempotently by provider record and receipt level, and show recent events to carrier tenant administrators. MMS media metadata is retained without the temporary signed download URLs; attachment downloads are not implemented. If you rotate the token, update all Flowroute callback URLs and restart the API.

For external text messaging, enter Flowroute API access and secret keys privately as `FLOWROUTE_ACCESS_KEY` and `FLOWROUTE_SECRET_KEY` in `/etc/olamide/secrets.env`, then rerun bootstrap or synchronize the private Compose environment and restart. In **Administration → Messaging webhooks**, confirm that a phone number belongs to this Flowroute account and is SMS enabled; assign its E.164 number to an active tenant user, set a daily send limit, and enable it. The user opens **Communications → Text messages**, chooses the assigned sender, and enters an external E.164 mobile number and SMS text. Incoming SMS and MMS callbacks for an assigned number appear in that user's inbox; outgoing SMS shows carrier acceptance or an unknown state if the provider response could not be confirmed. Delivery receipts are recorded in the administrator event log. Quota limits guard sends, but carrier usage charges are billed by Flowroute and no prepaid SMS wallet debit or settlement is implemented. A daily quota of zero blocks sending. Carrier messaging must be provisioned and funded with Flowroute before use. The existing **Account messages** page is separate server-based chat between Olamide users.

These controls cover number assignment, SMS inbox/outbox, callback monitoring, provider setup and tenant scoped administration. Other ASTPP billing, switch, reseller and carrier features require their own authoritative integrations and are not implied by these screens.

### Bootstrap the `olamidebello` super administrator

The application supports a local `olamidebello` username with super administrator privileges and a mandatory first login password change. This account is **not** created by a Git pull alone. After migrations and the API container are running, execute the following on the server console. The prompt reads the requested temporary password without printing it or adding it to shell history:

```bash
cd /opt/olamide/repo/deployment/docker
read -rsp 'Temporary super admin password: ' OLAMIDE_TEMP_PASSWORD; printf '\n'
printf '%s\n' "$OLAMIDE_TEMP_PASSWORD" | docker compose exec -T api node bootstrap-super-admin.js olamidebello
unset OLAMIDE_TEMP_PASSWORD
```

Enter the temporary value supplied during setup (the requested value is ten digits). Sign in using username `olamidebello`, then immediately choose a new password of at least 12 characters in **Account → Change password**. All privileged API routes remain blocked until that change succeeds. The account has an internal placeholder email address (`olamidebello@local.invalid`); set a verified real email through a separate account profile process before expecting mail delivery. The bootstrap command refuses an existing account and never resets its password. Super administrators can switch tenants and manage tenant administrators; tenant administrators cannot promote users to administrator or change another administrator's status or role.

### Flowroute outbound rate import

An administrator can open **Administration → Carrier rate deck**, select Flowroute's `outbound_rates.csv`, and choose **Import and activate rate deck**. The server validates all rows and imports a new version into MySQL as one transaction, then switches the active database deck after all rows succeed. Reimporting an identical file is idempotent. Every active prefix uses the `Default` USD-per-minute cost and a fixed **30% markup** (`user price = cost × 1.30`) rounded half up to six decimal places. For this supplied file, 98,249 unique current prefixes were validated; for example, `$0.008330` becomes `$0.010829` per minute. First and subsequent billing intervals are retained. The resulting rate deck is visible through **Communications → Outbound rates** by longest matching dialed prefix. It is a customer quote catalog; the PBX preview routes, live switch, prepaid enforcement, CDR rating, carrier settlement, and invoices are not activated by the upload. Commission an authoritative switch rating adapter and reconcile CDRs before using these prices to bill calls.

### Help menu, tutorials and AI support

Use the **Sign in** drop down in the public header to choose User, Administrator, Super administrator, Directory sign in, Create account, or Verify email. All roles use the same local sign in endpoint; a requested sign in destination does not grant that role. The assigned account role controls the menus after authentication.

Choose **Help** from the public header or **Workspace → Help & tutorials** when signed in. The Help page contains FAQs and a user tutorial; authenticated tenant administrators also see the administrator tutorial. **Open a support ticket** takes signed in users to the existing ticket workflow. The AI support guide handles general usage questions only and cannot modify accounts or carrier infrastructure.

To activate AI support, add `OPENAI_SUPPORT_API_KEY` to the private `/etc/olamide/secrets.env`, optionally set `OPENAI_SUPPORT_MODEL` (default `gpt-4.1-mini`), and rerun bootstrap so the API container receives it. Keep the key server side. The endpoint requires a signed in account, caps each question at 1,200 characters and ten requests per user per hour per API process, sends only that question and the fixed product guide to the model, uses `store:false`, and returns a generic error if the provider is unavailable. No account records, tickets or secrets are supplied to the model. Without a key, users can still read the FAQs and open a ticket. Production cost limits, retention policies and incident monitoring should be configured on the provider account before rollout.

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

## Carrier commissioning and future providers

The administrator Carrier providers screen is backed by the tenant-scoped
`carrier_provider_catalog`, `carrier_provider_profiles`, and
`carrier_provider_verifications` MySQL tables. Startup migration creates them.
Super admins can register a new carrier ID (2–16 lowercase letters, digits or
hyphens), then create a PBX trunk, save its profile, verify its adapter, and
activate it. Disabling a custom carrier requires adapter deactivation first.
Changing an active carrier profile or Flowroute PoP also requires deactivation.

Flowroute PoP setup creates or updates an initially disabled tenant trunk for
US-East-VA or US-West-OR on UDP 5060 and saves a draft profile. It never stores
the SIP password or API secret in the database or browser. Keep provider secrets
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
`DIDWW_TENANT_ID`, `DIDWW_API_KEY`, `DIDWW_API_ENV` (`sandbox` or
`production`), `DIDWW_ACCOUNT_CURRENCY=USD`, and the DIDWW-generated
`DIDWW_CALLBACK_SECRET` in private deployment configuration. The API version
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

Named dashboard views are scoped to a tenant or user. Tenant administrators can publish shared views and control personal overrides. Fleet grants expose shared infrastructure across tenants, so grant them only to trusted operators. API capacity controls still scale only 1–4 API replicas on a single Docker Compose host; MySQL and media are not clustered.
