# Olamide SIP

Olamide is a development browser softphone with a Node.js account API and MySQL 8.4 database. The repository has not been deployed to a public server.

## Generate the MySQL database

Install MySQL 8.4 and Node.js 20 or newer. As a MySQL administrator, create the database and apply the complete schema:

```sh
mysql -u root -p < services/api/create-database.sql
mysql -u root -p olamide < services/api/schema.sql
```

`create-database.sql` creates the `olamide` database using `utf8mb4`. `schema.sql` defines users, sessions, contacts, messages, settings, plans, subscriptions, invoices, port requests, DID quotes, meeting rooms, user groups, and group membership. It seeds the Standard group and assigns existing users to it once. Both scripts can be rerun. Create a dedicated MySQL application user and grant access to the `olamide` database; a commented grant example is in `create-database.sql`. Use a strong secret and keep the MySQL server time zone at UTC.

Set the application connection URL only on the API server. URL-encode reserved characters in the password:

```sh
cd services/api
npm install
MYSQL_URL='mysql://USER:PASSWORD@127.0.0.1:3306/olamide' \
PUBLIC_ORIGIN='http://127.0.0.1:5173' npm start
```

The API reapplies the idempotent table definitions on startup. On a remote MySQL connection, configure `MYSQL_SSL_CA` with the path to a trusted CA certificate. In production, run schema changes through a controlled migration process and remove the application's DDL privileges. Back up the database regularly.

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

The repository is a development foundation. It has no class 5 switch, carrier routes, live billing/settlement, DID purchase automation, native Android/iOS clients, Zoom-scale media server, meeting recording, remote keyboard/mouse control, OTP/passkeys/PIN, or production deployment. Browser-only geofencing and group flags cannot enforce policies on an external SIP server or inspect peer-to-peer media. Add a trusted SIP/media service, backups, operational monitoring, abuse controls, migrations, and security review before accepting real users or payments. No Acrobits, WhatsApp, Cash App, Zoom, or Zoiper code or branding is included.

## Debian 12 deployment

`deployment/ansible/site.yml` installs Ansible and Docker Engine with Compose on the server, checks out this repository, builds the browser and API images, starts MySQL 8.4 and Caddy, and enables the Compose stack at boot. Only HTTP and HTTPS are published by the stack. The chosen domain must resolve to the deployment host, and ports 80/443 must be open. This deploys the **browser app and account API only**; a SIP switch, carrier, TURN service, and native mobile apps are separate infrastructure.

From an SSH enabled Debian or Linux controller, install Ansible, verify the server's SSH host key fingerprint through your provider's console, save the verified host key in `~/.ssh/known_hosts`, and ensure key based SSH access works with a user allowed to become root for package installation. Do not paste a root password into GitHub or the repository. Create `deployment/secrets.env` from `deployment/secrets.env.example` with two different long random MySQL passwords. The value in `MYSQL_URL` must match `MYSQL_PASSWORD`; URL encode reserved password characters, or use URL safe random characters. Keep the file outside Git and back up MySQL before upgrades. Then:

```sh
OLAMIDE_DOMAIN=your.example.com ansible-playbook -i "YOUR_SERVER_HOST," -u YOUR_SSH_USER deployment/ansible/site.yml
```

The `Deploy Olamide` GitHub Actions workflow validates API and browser checks on changes and can deploy the validated commit automatically. Configure repository Actions secrets `DEPLOY_SSH_KEY` (private key for the server), `DEPLOY_KNOWN_HOSTS` (verified server host key line), and `DEPLOY_ENV` (the complete contents of `deployment/secrets.env`), `DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_DOMAIN`. Without all six it reports that deployment was skipped. The workflow can also be started with `workflow_dispatch`. Do not put real secret values in the sample file or commit them. Run `docker compose -f /opt/olamide/repo/deployment/docker/compose.yml ps` on the server to inspect status. Caddy obtains a TLS certificate only when DNS and inbound ports work.

## Tenants and super administration

The existing accounts and records are assigned to the `olamide` default tenant by an idempotent startup migration. New public signups enter that tenant. Tenant admins can create accounts and groups within their tenant; the new admin screen also lets them provision users. Super admins can create or suspend tenants, switch their administration context to an active tenant, see tenant status, and provision tenant admins. Sessions for suspended tenants stop authenticating. A user belongs to one tenant; a globally unique email cannot be reused in another tenant. Existing records remain in the default tenant. Groups, plans, meeting access, messaging contacts, mobile releases, and administrator listings are tenant scoped in the API. Provider API credentials remain shared on this single server, so use separate provider accounts and secret separation before hosting untrusted businesses.

There is deliberately no public super admin registration. After registering an initial account and starting the API, promote it on the server with:

```sh
cd /opt/olamide/repo/deployment/docker
docker compose exec -T api node promote-super-admin.js admin@example.com
```

Replace the email with the existing account's address. Only a person with server access can run this command. The role takes effect on the next authenticated request. Initial passwords for accounts created by administrators are provided by that administrator; self service reset, tenant invitation email, MFA, account deletion, and comprehensive tenant billing are not implemented. Review and test tenant policies before serving unrelated organizations.
