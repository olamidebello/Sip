# Olamide SIP

Olamide is a development browser softphone with a Node.js account API and MySQL 8.4 database. The repository has not been deployed to a public server.

## Generate the MySQL database

Install MySQL 8.4 and Node.js 22 or newer for the browser build. As a MySQL administrator, create the database and apply the complete schema:

```sh
mysql -u root -p < services/api/create-database.sql
mysql -u root -p olamide < services/api/schema.sql
```

`create-database.sql` creates the `olamide` database using `utf8mb4`. `schema.sql` defines the initial account tables. The API then applies the idempotent tenant migration, `pbx-schema.sql`, and `cdr-schema.sql` on startup. Create a dedicated MySQL application user and grant access to the `olamide` database; a commented grant example is in `create-database.sql`. Use a strong secret and keep the MySQL server time zone at UTC.

Set the application connection URL only on the API server. URL-encode reserved characters in the password:

```sh
cd services/api
npm install
MYSQL_URL='mysql://USER:PASSWORD@127.0.0.1:3306/olamide' \
PUBLIC_ORIGIN='http://127.0.0.1:5173' npm start
```

The API reapplies the idempotent base tables, tenant migration, `pbx-schema.sql`, `cdr-schema.sql`, `dids-schema.sql`, and `nigeria-schema.sql` on startup. On a remote MySQL connection, configure `MYSQL_SSL_CA` with the path to a trusted CA certificate. In production, run schema changes through a controlled migration process and remove the application's DDL privileges. Back up the database regularly.

This is a **new MySQL schema**. It does not import records from an earlier PostgreSQL database. If you have a populated PostgreSQL deployment, export, transform, and verify those records separately before switching traffic.

In another terminal, start the browser app:

```sh
cd apps/web
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. Vite forwards `/api` HTTP and WebSocket traffic to the API on port 8080. The MySQL integration check runs in GitHub Actions against MySQL 8.4. Locally, set `TEST_MYSQL_URL` to a disposable database before running `npm test` in `services/api`; `npm test` in `apps/web` runs its client tests.

## Current features

- SIP registration over secure WebSocket, browser WebRTC audio calling, answer/reject, hold/resume, hangup, and DTMF. An external WSS/WebRTC-capable SIP server and test account are required; account signup does not provision a SIP extension, phone number, or plan.
- Account registration and sign-in with scrypt password hashes and HttpOnly session cookies. Users can add contacts and exchange server-stored text messages. Messages have no end-to-end encryption or push delivery.
- Administrators can create user groups, assign feature access, see aggregate counts, create monthly plans, set a default SIP WSS URL, and set a DID markup. The Standard group permits meetings, screen sharing, messaging, and billing; pointer assistance starts disabled.
- Administrators can run tenant-scoped UTC reports for recorded calls, answer rate, duration, CDR sources and hours, invoice status by currency, DID inventory, port requests, registrations, and PBX agent status. Daily call and invoice summary CSV exports are available.
- Plan requests create unpaid invoices. No card or bank data is collected, no payment gateway is wired, and no subscription is activated automatically.
- Flowroute and DIDWW number inventory can be displayed when API credentials are configured. The default DID setup and monthly markup is 30%, rounded up to cents. Number purchasing is disabled. Port requests are drafts and are not submitted to carriers.
- Up to four signed-in participants can join a peer-to-peer meeting with audio/video, screen sharing, temporary chat, and host lock/remove/end controls. A permitted helper can request pointer assistance; the sharer must approve and can revoke it. The pointer is a page overlay and cannot control the operating system.
- Optional browser geofence policy in `apps/web/public/geofence-policy.json`. The sample policy is disabled until permitted zones are provided. Client location checks alone are not enforceable service controls.

Provider credentials belong only in the API environment:

```sh
FLOWROUTE_ACCESS_KEY='...' FLOWROUTE_SECRET_KEY='...' \
DIDWW_API_KEY='...' DIDWW_ACCOUNT_CURRENCY='USD' \
MYSQL_URL='mysql://USER:PASSWORD@127.0.0.1:3306/olamide' npm start
```

DIDWW inventory quoting requires confirmation that the provider account uses USD. A purchase must recheck inventory, taxes, eligibility, payment settlement, and provider pricing. No provider order is placed by this application.

For cross-network meetings, configure `MEETING_ICE_SERVERS_JSON` with STUN/TURN servers on the API. TURN credentials sent to browsers are visible to participants, so use short-lived credentials. The browser and API need a same-origin HTTPS reverse proxy in production. There is no bundled TURN server or native remote desktop agent.

## Limits before service launch

The repository is a development foundation. PBX and call center configuration is a planning control plane; no SIP switch or live call routing is connected. It has no class 5 switch, carrier routes, live billing/settlement, DID purchase automation, native Android/iOS clients, Zoom-scale media server, meeting recording, remote keyboard/mouse control, OTP/passkeys/PIN, or production deployment. Browser-only geofencing and group flags cannot enforce policies on an external SIP server or inspect peer-to-peer media. Add a trusted SIP/media service, backups, operational monitoring, abuse controls, migrations, and security review before accepting real users or payments. No Acrobits, WhatsApp, Cash App, Zoom, or Zoiper code or branding is included.

## Feature status and boundaries

This repository contains a browser SIP dialer, a MySQL-backed account API, and administration screens. The PBX, queue, DID routing, and rate deck screens **save and preview configuration**; they do not provision a SIP switch or handle media. Neither a plan invoice nor a previewed rate is a charge. A SIP account must come from an external WSS/WebRTC capable switch. This distinction is shown in the interface and API response.

| Area | Available now | Additional service required |
| --- | --- | --- |
| Browser softphone | SIP.js registration and WebRTC audio calling, hold, mute, DTMF, browser-local favorites, recent calls, local do-not-disturb, selectable audio output where supported | SIP WSS server, users, trunks, SBC, TURN as appropriate |
| PBX control plane | Tenant extensions, queue membership, DID destination maps, voicemail/forwarding intent | Switch provisioning, active dialplan, voicemail recording and delivery |
| Call center | Manual agent availability, ring-all/ordered/longest-idle eligibility preview | Live queue engine, call distribution, SLAs, recording, wallboards |
| Carrier routing | Planned trunks, prefix rate deck, tenant call barring with longest-prefix allow exceptions, longest-prefix least-cost preview; authenticated normalized call-record intake | Carrier credentials, switch enforcement, fraud controls, live CDR source and reconciliation |
| Billing | Monthly plan drafts and unpaid invoices, DID markup quotes | Payment gateway, taxes, prepaid balance enforcement, rated CDR settlement |
| Deployment | Debian bootstrap, TLS web/API stack, validated Git pull, backups before updates, OS security updates | Public DNS record, SSH/console access, carrier and SIP services |

### Nigerian in-house DID inventory

The Nigerian Communications Commission's National Numbering Plan lists `203150XXXX`, `203151XXXX`, `203152XXXX`, `203153XXXX`, and `203154XXXX` as five 10,000-number Ilorin blocks allocated to **Smooth Multi-Service Platform Limited**. Their E.164 forms run from `+2342031500000` through `+2342031549999`, within those five contiguous blocks. NCC allocation does not establish that every individual number is unused, under this application's operational control, or reachable. Confirm the allocation holder's authorization, actual unused inventory, interconnect, and routes before offering numbers. Source: https://ncc.gov.ng/operators/national-numbering-plan?page=2

An administrator selects each block under **Administrator → In-house DID management**, sets setup and monthly prices in cents, and imports its 10,000 numbers into MySQL as **unverified** candidates. Import is transactional and cannot run twice for the same block; duplicate numbers are skipped. The administrator may then publish a verified unused suffix range with an inventory reference and explicit confirmation. Only published numbers appear in the customer search. The API does not verify unused status with the allocation holder, so the administrator must reconcile inventory independently. These actions do not create SIP routes or fulfill purchases.

An administrator can stage a **valid individual E.164 number** with USD setup and monthly prices and a numbering-rights reference in **Administrator → In-house DID management**. Staged numbers are invisible to buyers. After independently checking the rights and reachability, the administrator can confirm and publish one. The server rejects invalid `+1` exchanges, duplicate numbers across tenants, and cross-tenant actions. Customers search published inventory and request a number. A MySQL transaction locks the number, creates an unpaid setup invoice, and reserves it for 24 hours; a second request for the same number fails. An administrator can release an expired reservation, voiding its unpaid invoice. This is **a reservation and invoice request, not a completed purchase**. Monthly fees are displayed but not charged. No payment confirmation, recurring billing, switch provision, inbound route activation, or carrier order is automated. Use the provider's assigned-number feed and switch provisioning acknowledgements before enabling fulfillment.

### Nigeria operator interconnect and NINAuth

The **Nigeria interconnect plans** admin panel stores a tenant-scoped clearinghouse or local-operator name, signaling host, port, transport, `234` destination prefix, and interconnect agreement reference. The preview picks the longest matching planned prefix for a `+234` number. It does not connect to a peer or route media. Obtain the exact point of interconnect, trunk authentication, IP allowlist, codec plan, routing authorization, fraud limits, CDR settlement specification, and commissioning test results from the licensed operator/clearinghouse before configuring a live switch. This application does not install a Nigerian gateway.

The **Nigeria identity verification** panel reports NINAuth as disconnected. It does not ask for, store, or claim to verify a NIN. NIMC's NINAuth enterprise integration requires registration and an approved verification relationship, exact redirect URI, user consent, PKCE, backend token exchange, and validation of the result. Obtain the approved enterprise/partner configuration and test access, then implement and security-review that exact provider flow; do not substitute a local NIN format check for identity verification. Do not put NINs, client secrets, access tokens, or profile data in GitHub, browser storage, or application logs.

### Browser calling tools

Connect with a provisioned SIP address, authorization username, password, and secure WebSocket URL. Dial a full `sip:user@domain` address. During a connected call use **Hold**, **Mute**, and **Send tone**. Add a favorite SIP address to dial it again quickly. The recent-call list records up to 50 attempted or received calls in this browser; **Clear recent calls** erases it. **Do not disturb** automatically declines incoming calls only while this page is connected. **Refresh audio outputs** lists available speakers; choosing one requires browser support for `setSinkId` and may require device permission.

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
3. On the server as root, install the minimal Git prerequisite and pull the repository:

   ```sh
   apt-get update
   apt-get install -y git ca-certificates
   git clone https://github.com/olamidebello/Sip.git /root/Sip
   cd /root/Sip
   OLAMIDE_DOMAIN=sip.dobhrap.com bash deployment/bootstrap.sh
   ```

   From a sudo-capable account, use `sudo env OLAMIDE_DOMAIN=sip.dobhrap.com bash deployment/bootstrap.sh`. Bootstrap installs Ansible, curl, jq, OpenSSL, Docker Engine and Compose, then generates two distinct random database passwords in `/etc/olamide/secrets.env` (mode 0600). It selects a main-branch commit whose GitHub validation workflow has completed successfully and deploys that commit. Re-running bootstrap keeps the existing secrets and data.
4. Open `https://sip.dobhrap.com/api/health` and expect `{"status":"ok"}`. Open `https://sip.dobhrap.com` to reach the browser client. A failed DNS/TLS check stops the playbook; inspect `journalctl -u olamide-compose` and `docker compose ps` in `/opt/olamide/repo/deployment/docker`.
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
6. Review **Recent security events** for password changes, account actions, group permission changes, membership changes, and group deletion. The latest 100 events for the selected tenant are shown. Each signed-in user can change their password under **Olamide account**; this revokes their other sessions. Audit records remain in MySQL and require a separate retention and backup policy. This is password and session management, not MFA, identity verification, intrusion detection, or a production security operations system.

### Reports and analytics

1. Open **Administrator → Reports and analytics**, choose inclusive UTC start and end dates (up to 366 days), then select **Run report**. The report is generated from MySQL for the tenant currently selected in your admin session. Tenant administrators see only their own tenant. Super admins must switch tenant context to review another tenant; this endpoint does not aggregate across tenants.
2. Review daily call counts, answer rate, duration and billable seconds, dispositions, directions, CDR sources, traffic by UTC hour, invoice count and recorded amounts separated by currency and status, port requests, new users, and current DID and PBX agent states. Missing days have no ingested calls. The inventory, total user, and agent figures are current snapshots; the other figures use the selected date range.
3. Download **daily calls CSV** or **invoice summary CSV** for external analysis. API endpoints are `GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` and `GET /api/admin/reports.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=calls|invoices`. Authentication and administrator role checks apply to both. CSV output contains aggregate data, not customer phone numbers. Recorded CDRs depend on configured ingestion and may not represent every switch event. An invoice marked paid is a database status, not independently reconciled cash receipt. No scheduled reports, provider settlement, live switch telemetry, queue event timing, or revenue recognition engine is implemented.

### PBX extension and queue configuration

1. Create each **extension** with a unique 2–10 digit number, display name, optional assigned user, voicemail intent, and optional forwarding target. A number cannot also be a queue number in the same tenant. The user's **Call center agent** panel displays their assigned extension. Creation saves database intent; it does not provision a SIP device, password, voicemail box, or switch dialplan.
2. Create a **queue** with a number, name, strategy (`ring_all`, `ordered`, `longest_idle`), and maximum wait time. Select the queue, check its tenant users, and save members. Grant the `Call center agent` group feature to the intended agents. Agents set their own manual availability to `ready`, `away`, or `offline`. **Preview eligible agents** computes the next agents from this status and the queue order. It does not ring phones. `longest_idle` uses the last manual status change, not a verified call idle time.
3. Under **Inbound DID routing**, enter an E.164 DID and select a saved extension or queue. This maps the number to a destination in MySQL. You must separately configure your carrier and a live PBX to deliver the DID; no carrier order or dialplan update is sent.
4. Add a **trunk plan** with name, host, port, transport and priority. The button labeled **Enable for preview** includes the trunk in simulation only. Credentials are deliberately not stored in the trunk table. Add prefix rates in integer cents per minute with selling price at least cost; then preview an outbound E.164 number. The preview selects the longest matching prefix, lowest cost, then trunk priority. No outbound call or real-time balance authorization occurs.
5. The PBX API also exposes `GET /api/pbx/overview`, `/extensions`, `/queues`, `/inbound-routes`, `/trunks`, `/rates`, and `/route-preview?number=%2B12125550123`. All admin mutations require a signed-in administrator and the browser's configured origin. Agent status and an assigned extension are accessible to the signed-in user. Use the browser interface for routine work.

### Plans, numbers, communication, and mobile releases

- Create monthly plans and review unpaid invoices. Plan selection creates a pending invoice; a separate payment processor, tax engine, and settlement reconciliation are required. The DID markup defaults to 30% and can be changed for the current tenant. Flowroute/DIDWW searches need provider API keys in the server environment. Purchase and number port submission remain disabled.
- Add contacts in the same tenant, send server-stored messages, and use meeting rooms with up to four participants. Meeting chat is temporary; screen sharing uses the browser's screen capture. Pointer assistance is an overlay and cannot operate the remote desktop. Configure TURN for cross-network calls. Messages have no end-to-end encryption or push delivery.
- Android/iOS release administration records app identifiers, artifact references, tracks, internal approval, and audit history. It does not build native clients or submit to Google/Apple stores.

## Integration work required for a live PBX or ASTPP-class service

Choose a licensed and supported switch (for example Asterisk/FreeSWITCH with an SBC and a suitable provisioning layer) and implement tenant-isolated provisioning for PJSIP credentials, TLS/WSS, dialplan, queue engine, voicemail, inbound/outbound carrier routing, emergency calling policy, media/RTP, and CDR ingestion. Require reconciliation and idempotency between the Olamide database and the switch. Add per-tenant carrier credentials, explicit route activation, number ownership checks, fraud limits, call recording consent and storage policy, and monitoring before enabling trunk traffic. For ASTPP-like charging, add authoritative CDRs, prefix effective dates, rounding rules, taxes, prepaid credit reservation, low-balance interruption, dispute adjustments, and audited settlement. For 3CX-like call center operation, add live queue distribution, presence tied to registration and calls, SLA measurement, callbacks, recording, reports, and supervisor controls. The current queue and LCR endpoints are safe previews for that implementation, not an operational substitute.
