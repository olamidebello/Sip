# SIP WebSocket repair package

Prepared for sip.dobhrap.com on Debian 12. Not run against your server.
Only a screenshot was available; deployed app code, Nginx layout and Kamailio listener port are unknown. This package cannot claim to fix all registration, provisioning or calling issues.

Requirements: Ansible on the controller; SSH access; Python 3, Nginx and Kamailio already installed on the server. Preserve SSH host-key verification. The playbook assumes host-managed services, not Docker. For container deployment, adapt service paths and commands first.

## Run diagnosis

Unzip, enter sip-repair, and use your SSH key:

```bash
ansible-playbook -i inventory.ini repair.yml -e ws_port=8080
```

8080 is an example, not a discovered setting. Set the actual Kamailio TCP WebSocket listener port. The script validates Kamailio configuration, checks the local listener, verifies its SIP WebSocket handshake and verifies the public TLS endpoint. It installs only the diagnostic probe by default; it makes no proxy changes.

## Enable proxy repair

For a dedicated existing Nginx TLS server file with one server block and no pre-existing /ws location or unrelated includes:

```bash
ansible-playbook -i inventory.ini repair.yml \
  -e ws_port=8080 \
  -e repair_proxy=true \
  -e nginx_site=/etc/nginx/sites-available/sip.dobhrap.com
```

The site path is an example. The file must already be enabled, serve sip.dobhrap.com and have a working certificate. A file containing both HTTP redirect and TLS server blocks is deliberately rejected. Existing routes/includes need inspection to avoid duplicate locations. The script backs up the site, adds an exact /ws proxy, validates Nginx, reloads, and restores the original site if validation/verification fails. The managed snippet is dedicated to this package; do not reuse it elsewhere. On failure, the prior managed snippet is restored or the newly created snippet is removed. Keep the site backup for manual rollback.

The script does not install or replace Kamailio authentication, routing, database, firewall or TLS policy. If the local handshake fails, correct Kamailio's websocket/xhttp handshake route and actual listener before attempting proxy repair. Never bypass SIP authentication to make a connection test pass.

## Fix the browser error

The screenshot's displayed URL has valid syntax. The actual value passed into the library may differ, or the SIP.js options may use the wrong property. Modern SIP.js uses `transportOptions.server`. The supplied sip-client-options.mjs normalizes and validates that property and requires provisioned credentials. It is an integration helper, not an automatic source patch. Import it at your actual UserAgent construction site and rebuild/redeploy through the app's normal pipeline.

Fetch credentials only through an authenticated backend that checks ownership and tenant permissions. An empty password field does not establish that stored credentials are missing; inspect the application credential flow. Do not reset all user passwords or ship secrets to every browser. Existing credential creation and Kamailio credential storage must agree.

## Acceptance checks

1. Both local and public handshake probes pass, including TLS verification and negotiated `sip` subprotocol.
2. Actual browser runtime uses the normalized URL, and no invalid-URL error remains.
3. Authenticated login returns credentials only for that user's authorized SIP profile.
4. SIP REGISTER reaches Registered (101 WebSocket upgrade alone is insufficient).
5. Two authorized workspace users can call, receive and hear two-way audio.
6. Subscription checks continue to enforce external calling/text eligibility.

Phone background incoming calls and push/CallKit need native app implementation and provider credentials; a WebSocket repair cannot supply them. TURN/media, external trunks, subscription enforcement and database provisioning need source-specific work.

References:
https://sipjs.com/guides/user-agent/
https://www.kamailio.org/docs/modules/stable/modules/websocket.html
