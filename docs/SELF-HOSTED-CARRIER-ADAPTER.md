# Install the included carrier adapter

The repository now includes a Python HTTPS adapter for an existing **native FreeSWITCH** installation. It generates a stable private token, creates `/root/carrier-adapter.json` automatically, commissions the GUI target and checks switch health. No manually created adapter JSON is needed. This installer does not install FreeSWITCH, modify Kamailio routes, or support containerized FreeSWITCH without an additional backend.

On the server:

```sh
cd /opt/olamide/repo
git fetch origin main
git merge --ff-only origin/main
ansible-playbook -i deploy/ansible/same-server.inventory.example.yml deploy/ansible/install-carrier-adapter.yml
```

The installer discovers the tenant automatically when there is exactly one active administrator tenant. For multiple tenants, pass `-e carrier_adapter_tenant_id=YOUR-TENANT-UUID`.

Prerequisites: the existing API/database is migrated; the tenant has an active super administrator; `fs_cli -x status` works as root; the `external` Sofia profile includes XML files under `/etc/freeswitch/sip_profiles/external`; dialplan includes `/etc/freeswitch/dialplan`; and a valid certificate exists at `/etc/letsencrypt/live/sip.dobhrap.com/{fullchain.pem,privkey.pem}`. Override `carrier_adapter_fs_cli`, `carrier_adapter_gateway_dir`, `carrier_adapter_dialplan_dir`, `carrier_adapter_profile`, `carrier_adapter_certificate`, and `carrier_adapter_private_key` for your actual installation. Port 18443 must be reachable from the API container and server. The installer leaves firewall configuration to your existing network policy. Certificate renewal requires restarting `olamide-carrier-adapter`.

The adapter supports health, verify, activate and deactivate for one explicit tenant and Flowroute. Activation writes tenant-specific gateway and dialplan XML, reloads/rescans the existing profile, verifies that the gateway loaded, and returns the exact configuration revision. Failed application restores prior files and rescans. Existing calls are not intentionally hung up; changes affect subsequent routing. Tokens are mode 0600. Generated XML is owned by root and the containing directory’s group with mode 0640; that group must allow the FreeSWITCH process to read it.

## Complete the authenticated call route

Installation defaults `routingCommissioned` to false. Health and GUI setup work, while verify/activate fail closed until the existing authenticated and billed call route is integrated. The reviewed upstream route must set `olamide_tenant_id` to the selected tenant UUID, set `olamide_pstn_authorized=true` **only after server-side authorization and billing reservation**, and transfer eligible E.164 PSTN calls to the FreeSWITCH context `olamide-carrier-TENANT-UUID`. Subscriber-supplied headers must never set these variables. Enforce concurrency, fraud policy, balance deductions, and call accounting in that route; the adapter does not implement them.

After validating that integration, rerun the installer with `-e carrier_adapter_routing_commissioned=true`. This attests that the upstream route was commissioned; it does not build or test that route. Save the Flowroute IP allowlist confirmation, tech prefix and authorized caller ID in the existing super administrator gateway GUI, then provision the gateway. No fallback carrier is added. IP mode prepends the tech prefix; digest mode stores the configured SIP password in the private XML. Capacity remains an administrator setting and needs load testing. Test an authorized outbound call, two-way audio, denied free-account PSTN access, and billing before production traffic.

This is a working provisioning service with unit-tested switch failure handling, not evidence that a live call has succeeded. TLS, actual FreeSWITCH loading, and network reachability must be verified on your server. Logs and responses never contain the token or SIP password.
