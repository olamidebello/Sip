# Existing HTTP Kamailio integration

Use `deploy/ansible/sip-http-bridge.yml` when the existing live configuration calls `http://127.0.0.1:18080/api/switch/kamailio/auth` and `/route`, as on sip.dobhrap.com. This is an alternative to the separate reviewed database-authentication profile, not an additional profile cutover.

The API runs a dedicated protected listener on container port 8081, published only at host loopback 18080. Browser/public API routes do not expose switch lookups. A persistent random Bearer token is stored in the private secrets file and added to exactly two existing Kamailio HTTP calls. The preparation helper retains the request and response variables and fails on unrecognized call syntax. It does not replace live configuration. The playbook validates the staged file before application cutover and backs up and restores Kamailio configuration on restart failure.

Prerequisites: existing valid SIP_CREDENTIAL_KEY in /etc/olamide/secrets.env, functioning Docker/MySQL and Kamailio, and the configured private switch_nodes inventory. Do not rotate the encryption key. Drain calls before restart.

```sh
cd /opt/olamide/repo
 git pull --ff-only origin main
cd deploy/ansible
ansible-playbook -i same-server.inventory.yml sip-http-bridge.yml --ask-vault-pass -e kamailio_maintenance_approved=true
```

Auth requests POST {domain,username} and receive {ha1} from the active authentication view. Routing requests POST {domain,caller,destination} and receive {route:"extension",username} only for active identities in the same tenant and domain. External calling is denied by this bridge; the observed live configuration only accepts extension routes. Subscription-enabled carrier routing needs a separately commissioned integration.

Check unauthenticated localhost requests return 401, Kamailio remains active, and a fresh application login reports Registered. Then test an actual workspace call and two-way audio. A 401 listener check establishes protected reachability, not successful SIP registration. Full application/image rollback, existing-dialog revocation and capacity acceptance remain separate from Kamailio configuration rollback.
