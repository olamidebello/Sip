# Kamailio carrier adapter

Use `deploy/ansible/install-kamailio-carrier-adapter.yml` for the reported Kamailio 5.6.3 server. The legacy alternate-switch installer has been removed. This installer stages `ctl` and `htable` modules, a private Unix RPC socket and an unused carrier route definition. It validates the entire staged config with `kamailio -c`, saves a backup, restarts Kamailio only if the config changed, and restores the backup if startup/RPC checks fail. Schedule installation between calls because the initial configuration restart interrupts Kamailio processing.

```sh
cd /opt/olamide/repo
git fetch origin main
git merge --ff-only origin/main
ansible-playbook -i deploy/ansible/same-server.inventory.example.yml deploy/ansible/install-kamailio-carrier-adapter.yml
```

It discovers a unique active administrator tenant, generates and preserves the HTTPS bearer token, writes the private JSON automatically, starts the HTTPS adapter on port 18443, and commissions the GUI target/node. For multiple tenants, provide `-e carrier_adapter_tenant_id=YOUR-TENANT-UUID`. The existing API/database must be migrated. A readable valid certificate and key are expected under `/etc/letsencrypt/live/sip.dobhrap.com/`; override `carrier_adapter_certificate` and `carrier_adapter_private_key` for another certificate location. Restart the adapter after certificate renewal. Port 18443 must be reachable from the API container; the installer does not change the firewall. Existing `ctl` or `htable` configuration without this installer's marker causes staging to stop for review.

The Kamailio backend supports Flowroute **IP authentication**. Health verifies local RPC access. Activation validates a configured Flowroute POP, tech prefix, caller ID, public IP and exact revision, updates a tenant-keyed htable entry atomically, reads it back, and persists the private state. Failed readback restores the previous runtime entry. Deactivation clears the entry. Existing SIP registration and extension routing remain unchanged. Carrier activation does not restart Kamailio.

## Remaining paid-call integration

The reported live request route and `services/api/kamailioHttpBridge.js` currently support extension routing only. Installation does not turn that into a billed PSTN route. `routingCommissioned` therefore defaults to false, and verify/activate return an error until that integration is implemented and tested.

The added `OLAMIDE_FLOWROUTE` hook expects `$var(olamide_tenant_id)` and `$var(olamide_pstn_authorized)=1` from the authenticated, server-authorized billing path. It validates E.164 destinations and builds the Flowroute `techPrefix*number` URI and UDP destination. It does not relay the call itself. The upstream route must reserve credit, enforce subscriptions/fraud/concurrency, apply the configured authorized caller ID, process RTP, record-route and relay, and settle accounting on completion. Subscriber-controlled values must not set these authorization variables. Only after this integration is actually commissioned should deployment set `-e carrier_adapter_routing_commissioned=true`.

A Kamailio restart clears in-memory carrier state, so the route fails closed until the gateway is reactivated in the GUI. The private state file is available for recovery but is not automatically replayed. Health proves RPC reachability, not successful SIP calls or billing. The Python backend and stage generator have unit tests; actual Kamailio parser validation and call testing take place on the server during deployment/integration.
