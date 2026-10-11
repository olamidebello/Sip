# Automatic SIP login deployment

Run from the checked out release on the server:

```sh
cd /opt/olamide/repo/deploy/ansible
ansible-playbook -i same-server.inventory.yml sip-auto-login.yml \
  -e sip_registration_config_source=/etc/olamide/profiles/same-server/kamailio \
  -e kamailio_maintenance_approved=true
```

Use the inventory example to create the private inventory. The existing authenticated registration profile, Docker secrets file, MySQL, TLS reverse proxy and working `/ws` forwarding must already be commissioned. Drain calls before the configuration cutover. The playbook deploys the current checkout; it does not pull Git or invent server credentials.

The playbook preserves the encryption key, configures SIP_ACCOUNT_DOMAIN and SIP_WSS_URL, runs authenticated Kamailio provisioning, and rebuilds API and web. Set `sip_wss_url` to override the default `wss://sip.dobhrap.com/ws`. A tenant's server configuration takes priority over this deployment default.

Existing reconciliation creates missing accounts for active users and retries activation. New accounts also provision during signup and authenticated session bootstrap. The browser requests only the signed-in user's assigned credentials, registers after login, reports registered/disconnected status and retries while open. Secrets remain in memory and are not stored in browser storage. Backend tenant, group and user policies enforce view/add/edit/delete; default add/edit/delete are denied. SIP account login is independent of permission to edit saved profiles.

Acceptance: sign in as a normal user, verify the assigned address and WSS URL, confirm Registered, call another active workspace user, interrupt connectivity and confirm reconnection. Check that unauthorized profile POST/PUT/DELETE requests return 403 and cross-tenant profile IDs cannot be modified. Repeat after logout/login. API health alone does not establish successful SIP registration or working audio. Browser suspension requires the separate native push/CallKit integration.
