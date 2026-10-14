# Automatic private adapter setup

This playbook populates the screenshot's private target and carrier node, stores the token encrypted, checks the real adapter, and enables the node only after acknowledgement. It uses the same validation, audit events and assignment protections as the super administrator GUI. Reruns preserve unchanged credentials. Changing a target used by an enabled or assigned node is refused.

It commissions an **existing HTTPS carrier provisioning service**; this repository does not contain that service. Its endpoint must implement the request and response contract in `services/api/adapterRegistry.js`. Health must return `{"status":"healthy"}`. A Flowroute account's SIP credentials are not adapter credentials. Tokens cannot be generated independently of the service: the supplied token must match its authentication configuration.

After pulling this version into `/opt/olamide/repo`, create `/root/carrier-adapter.json` with permissions 0600:

```json
{
  "tenantId": "YOUR-TENANT-UUID",
  "targetKey": "primary",
  "url": "https://YOUR-REAL-ADAPTER/provision",
  "token": "YOUR-EXISTING-ADAPTER-TOKEN-AT-LEAST-32-CHARACTERS",
  "provider": "flowroute",
  "name": "Primary carrier adapter",
  "region": "us-east",
  "priority": 100,
  "maxConcurrentCalls": 500
}
```

Keep that file private and outside Git. On an unchanged saved target, omit `token` to retain it. The tenant must have an active super administrator, and the database must already be migrated. HTTPS certificates are verified; a failed health check aborts commissioning. Capacity is an administrator setting, not a load-test result.

```sh
ansible-playbook -i deploy/ansible/inventory.example.yml deploy/ansible/carrier-adapter.yml -e carrier_adapter_config=/root/carrier-adapter.json
```

Use your actual inventory. The source checkout and Docker deployment must already exist. Run this playbook after your ordinary deployment, or import it from your deployment playbook. It builds the API and starts it with the stable encryption key. The administrator can manage the populated target and node using the existing GUI.

A health check does not activate Flowroute, configure a switch, confirm allowed IPs, or demonstrate successful calls. Use the gateway commissioning control after the adapter service is configured to apply the exact switch configuration, then verify a call and two-way audio.
