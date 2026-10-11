# Unattended user login deployment

Run on the existing Debian server as root after applying this release to
`/opt/olamide/repo`:

```bash
ansible-playbook -i /opt/olamide/repo/deploy/ansible/user-login.local.yml /opt/olamide/repo/deploy/ansible/user-login-unattended.yml
```

Requires Ansible, Docker Compose, an already running API/database and commissioned
Kamailio registration/authentication configuration, a working SIP_WS_UPSTREAM,
and the existing SIP_CREDENTIAL_KEY in /etc/olamide/secrets.env. The playbook
fails if these are missing instead of generating a replacement key or guessing
a switch configuration. It does not pull Git, rewrite Kamailio, rotate user
passwords, or request credentials. Existing permissions and MFA requirements apply.

The browser shows the authenticated name/email in My profile. Its existing
login handler calls POST /api/sip-account/session, which creates a missing
account, retries switch provisioning, and returns only the current tenant user's
assigned settings. The browser fills SIP address, username, and WSS URL, passes
the SIP password directly to SIP.js, and registers automatically. The visible
password field remains empty. Credentials are not saved in browser storage.
Network-loss retries, pending activation, and logout cleanup use the existing
registration controller. Registration operates while the web app is running;
native background calls require the separately configured native push services.

Validation: API readiness, public HTTPS health, and TLS SIP WebSocket upgrade.
A transport success does not verify a REGISTER response or media. After deployment,
sign in as two authorized users, confirm Connected on both, place an internal call,
check two-way audio, and sign out to confirm disconnection. Free accounts retain
internal-only calls; external calls still require an active plan.

If the script stops on key verification, preserve the existing key and investigate
the saved keys using tools/repair_sip_credential_key.py. If it stops on switch or
WebSocket readiness, repair that commissioning prerequisite first. Deployment
recreates API/web containers and can interrupt browser connections.
