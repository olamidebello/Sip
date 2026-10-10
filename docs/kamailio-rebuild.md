# Kamailio rebuild (work in progress)

This branch replaces the FreeSWITCH-specific switch plane in stages. It is not a production switch and must not be cut over until the gates below pass.

## Component boundaries

| Component | Responsibility |
| --- | --- |
| Kamailio | SIP registrar, digest authentication, tenant domain separation, routing and carrier selection |
| RTPengine | RTP/SRTP and WebRTC media relay and NAT traversal |
| Media application server | IVR, voicemail, queues, conferencing, recordings and announcements |
| Olamide API/MySQL | Tenant provisioning, encrypted source credentials, HA1 synchronization, authorization, tariff policy, CDR and payment state |
| Carrier adapters | Flowroute/DIDWW trunks and DID ingress with verified peer addresses |

The API exposes `POST /api/switch/kamailio/route` with a private bearer token. Kamailio must authenticate REGISTER and INVITE before passing its verified username, domain and destination. The API rejects unknown tenants, inactive users, disabled accounts, disallowed destinations and routes without an enabled tariff and carrier mapping. Its response is a route decision, not a direct carrier credential or arbitrary SIP URI.

`kamailio_credentials` stores an MD5 HA1 digest required by SIP Digest. The `kamailio_active_subscribers` view joins the existing user, tenant, account and switch enablement states so disabling one revokes authentication. Read-only database access should be granted only to the view. The activation path synchronizes credentials; `backfill-kamailio.js` handles existing active accounts. The plaintext SIP password remains encrypted in `sip_accounts` and is never returned by the route endpoint.

## Pending implementation gates

- Deploy a pinned Kamailio release and RTPengine with verified packages, TLS/WSS certificate renewal, root-owned private configuration, firewall ACLs and service health probes.
- Validate Kamailio digest auth against the active subscriber view; reject unauthenticated INVITE, cross-tenant From/To, spoofed caller and all unknown methods.
- Implement an authenticated adapter from Kamailio to the route endpoint, including timeout and reject behavior, URI mapping, NAT, RTPEngine offer/answer/delete and WebRTC media negotiation.
- Provision media application servers for IVR, queues, voicemail, conferencing and recording. Kamailio alone does not provide the existing media applications.
- Wire DID ingress to verified carrier peers and tenant ownership, handle emergency calls explicitly, and reconcile CDRs with rating and balances.
- Verify a real registration, extension call, outbound carrier call, inbound DID, hangup, failed authentication, browser WSS call, media, recording, failover and 500-call capacity target.
- Keep the current FreeSWITCH deployment serving traffic until rollback and migration tests pass. Do not run this branch's database migration on production until its schema and permissions are reviewed.

## Secrets and operation

Set `KAMAILIO_ROUTE_TOKEN` as a private random value of at least 32 characters in the API runtime and Kamailio adapter. It must not be committed or placed in a URL. Use a separate MySQL user limited to `SELECT` on the active subscriber view for Kamailio authentication. Apply schema migration before running the backfill, with `MYSQL_URL` and `SIP_CREDENTIAL_KEY` supplied privately to the API container.

The leaked SignalWire token used in earlier package attempts is unrelated to this rebuild and should be revoked.

## Staging on the switch host

The repository tracks `deploy/ansible/inventory.example.yml`, not `deploy/ansible/inventory.yml`. A locally generated inventory in a different worktree is not automatically present here. Ansible reports a successful zero-host play when its inventory cannot be parsed, so verify the recap names `sip-switch-1`.

On the Debian 12 switch as root, from the existing isolated worktree:

```bash
cd /opt/olamide/kamailio-staging
printf '[switch_nodes]\nsip-switch-1 ansible_connection=local\n' > /tmp/olamide-kamailio-inventory.ini
ansible-inventory -i /tmp/olamide-kamailio-inventory.ini --graph
ansible-playbook -i /tmp/olamide-kamailio-inventory.ini deploy/kamailio/stage.yml
ansible-playbook -i /tmp/olamide-kamailio-inventory.ini deploy/kamailio/validate.yml
rm -f /tmp/olamide-kamailio-inventory.ini
```

These staging playbooks do not need the production Vault password and do not enable the services. Check a nonempty PLAY RECAP and the parser result; do not switch live signaling or run the Kamailio database migration.

## Host-only API integration

The draft compose file now binds the API container at `127.0.0.1:18080` on the host. The adapter template must use `kamailio_api_url=http://127.0.0.1:18080` when rendered. This binding becomes available only after deploying the reviewed compose change; package staging did not change the running API. Use `bash deploy/kamailio/preflight.sh` for read-only package, API health, and unauthenticated endpoint checks. A passing preflight is not a SIP call test.

To commission authentication, provision a private `KAMAILIO_ROUTE_TOKEN` of at least 32 characters in the API and a root-readable Kamailio config, migrate the Kamailio credential table, and backfill active SIP accounts. Never run the backfill against production without a database backup and reviewed credentials. The current loopback template returns 503 for all carrier dispatch, and neither media server applications nor public SIP listeners are configured. It cannot be used for production or the requested 500 concurrent calls.

## Isolated API pilot

After updating the existing staging worktree, run `bash deploy/kamailio/run-pilot.sh` as root. The runner refuses an API database URL unless its host is `mysql`, checks that port 18080 is free and the API is bound to 127.0.0.1, builds a separately tagged image, then starts only `api` and its `mysql`/`migrate` dependencies in the separate `olamide-kamailio-pilot` Compose project. It generates a temporary token for this pilot, runs health checks and a rejected unauthenticated request, and does not start the web, SIP, or RTPengine services. It is not a production migration or cutover.

The pilot uses the existing deployment environment values for an isolated MySQL volume; no subscriber records are copied. Do not use it for live SIP registrations or carriers. Stop the pilot with `docker compose -p olamide-kamailio-pilot --env-file /opt/olamide/repo/deployment/docker/.env -f deployment/docker/compose.yml -f deploy/kamailio/pilot.override.yml stop api mysql`. Preserve its volume until test results are reviewed.

## Super admin cluster and Kamailio monitoring

Cluster & capacity now exposes the existing bounded single-host API replica request, a persisted switch capacity target with revision history, observed fresh switch inventory, region gap, and a link to the existing fleet deployment jobs. The target is planning intent; it does not create hosts, move calls, or certify a 500-call load test.

The private deployment runner reports Kamailio and RTPengine systemd state to `kamailio_node_checks`. Super admins can view recent reports and queue `kamailio_test`, which runs the loopback OPTIONS/REGISTER/INVITE challenge smoke test. This action cannot activate a public listener or carrier route and does not set the generic host health status. The runner and API must both be deployed from the same reviewed revision for the new endpoint and action to work. Existing production runner jobs still probe FreeSWITCH separately.
