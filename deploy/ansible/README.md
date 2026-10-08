# FreeSWITCH switch deployment

The Ansible role installs FreeSWITCH on dedicated Debian 12 switch nodes, enables authenticated `mod_xml_curl` directory and dialplan lookups, installs a trusted WSS certificate, pins the event socket and node metrics to loopback, configures time synchronization and service restart limits, optionally installs coturn, and applies an opt-in nftables ruleset. The API stores tenant domains, SIP account credentials, tariffs and gateway mappings in MySQL. No carrier traffic is enabled by the role merely installing packages.

## Source installation without a SignalWire package token

On a Debian 12 switch host, the role can build the upstream FreeSWITCH v1.11.3 release from public source. This path compiles the prerequisite libraries, includes `mod_xml_curl`, installs a local systemd service, and then applies the same XML lookup, TLS, gateway and health checks as the package path. It does not use the SignalWire Debian repository or its token. The first run can take substantial time and needs build disk and memory. Dependency repositories are currently fetched from their public default branches; use a reviewed immutable dependency snapshot for reproducible production builds.

The existing private inventory and encrypted Vault still supply `vault_freeswitch_xml_password` and `vault_freeswitch_esl_password`. The package token is ignored in source mode. Do not put passwords in the command line. From the switch host itself, after updating the repository:

```sh
cd /opt/olamide/repo
ansible-playbook -i deploy/ansible/inventory.yml deploy/ansible/site.yml \
  -e ansible_connection=local -e freeswitch_install_method=source \
  --ask-vault-pass
systemctl is-active freeswitch
/usr/local/freeswitch/bin/freeswitch -version
```

The existing `controller-bootstrap.sh` is still for the package workflow and performs an SSH preflight, so use the playbook directly for a local source installation. If the private Vault was generated with a token previously pasted into a chat, revoke that token in SignalWire. It is not needed for this route. Source mode refuses to mix with an already installed FreeSWITCH Debian package and stops if a preexisting `/etc/freeswitch` directory would be overwritten. The source build is marked by `/usr/local/freeswitch/.olamide-source-v1.11.3`; do not treat a marker alone as a live-call test.

This is the upstream FreeSWITCH engine integrated with the Olamide API, not a completed carrier service. Add real gateways, tariffs, DID ingress and call policies, and verify registration, routing and media before opening production traffic.

## Supported release and upgrade

The role requires FreeSWITCH **1.11.3 or newer** from the authenticated SignalWire stable Debian repository. With `freeswitch_upgrade: true`, it checks the repository candidate before installation, updates the FreeSWITCH package set, and verifies both installed and running versions. If the stable repository has an older candidate, the playbook stops; it does not silently install an older switch or fetch unreviewed source. The default playbook processes switch nodes one at a time.

On an existing node, the role checks `show calls count` and stops when calls are active, then saves `/etc/freeswitch` and the previous package version under `/var/backups/olamide-switch` before a package upgrade. It does not automatically drain calls or move traffic to another node. Schedule a maintenance window for a single-node system; for a cluster, remove one node from new-call selection, wait for active calls to reach zero, run the playbook, and verify a test call before moving to the next node. Other configuration changes may also restart FreeSWITCH; treat every playbook run as a maintenance operation.

For rollback, disable new calls to the node, inspect the saved `.version` file and package availability with `apt-cache policy freeswitch`, install the previous package set if still available, restore the matching configuration archive, restart FreeSWITCH, and verify registration, routing, and media. Keep a VM snapshot when the package repository does not retain older versions. No automatic package downgrade is attempted.

## Prepare

1. Create a SignalWire Personal Access Token for FreeSWITCH package downloads.
2. Obtain a CA-trusted certificate and private key for the WSS SIP domain. Store them at the controller paths set in inventory. Do not commit them.
3. Set `SIP_CREDENTIAL_KEY` (64 hexadecimal characters) and `FREESWITCH_XML_PASSWORD` (32+ random characters) on the API server. Use the identical XML password in the encrypted Ansible Vault. Keep the API at a private HTTPS URL reachable from the switch. Block public access to `/api/switch/xml` at the proxy when private networking permits; the endpoint also requires HTTP Basic authentication.
4. Copy `inventory.example.yml` to a private inventory, replace the example host, addresses, domain, API URL and SSH allowlist. Encrypt secrets with Ansible Vault. Do not store unencrypted tokens or credentials in git.
   Create `group_vars/switch_nodes/vault.yml` with `ansible-vault create` and define `vault_signalwire_token`, `vault_freeswitch_xml_password`, and `vault_freeswitch_esl_password`. Add `vault_coturn_secret` when TURN is enabled. Keep that vault file and the WSS private key outside this repository.
5. For a dedicated switch node, set `manage_firewall: true`. The role opens WSS TCP 7443, RTP UDP 16384–32768, and SSH only from `freeswitch_ssh_allowed_cidrs`. Optional SIP ingress TCP/UDP 5080 is allowed only from `freeswitch_carrier_allowed_cidrs`. It replaces the node's nftables ruleset; use `manage_firewall: false` where another firewall manager owns the host. Permit the same traffic in the provider's cloud firewall. The example IPs are documentation ranges and must be replaced.

Run from `deploy/ansible`:

```sh
ansible-playbook -i inventory.yml site.yml --ask-vault-pass --syntax-check
ansible-playbook -i inventory.yml site.yml --ask-vault-pass
```

The role verifies `systemctl is-active freeswitch` and a local ESL `status` command. It does not perform a live carrier call or verify media quality. Repeat the playbook for additional nodes in `switch_nodes`; they share the API's MySQL-backed lookups.

## Carrier gateways and GUI

A gateway requires a real carrier SIP proxy and, if applicable, SIP credentials and carrier-side IP authorization. Add a vaulted inventory entry, then run Ansible:

```yaml
freeswitch_gateways:
  - name: flowroute_primary
    proxy: sip.carrier.example
    register: false
    username: ''
    password: ''
```

In **Administration → FreeSWITCH**, choose the tenant domain and outbound tariff, map its carrier profile to the exact Sofia gateway name, and activate individual SIP accounts. Enable the tenant lookup and gateway mapping after verifying the real gateway on the switch host. New or previously unkeyed accounts receive encrypted SIP credentials on activation and users can retrieve their own credentials through the existing account screen.

The XML endpoint supports authenticated internal extensions and E.164 outbound routes. It checks tenant identity, outbound PBX policy, blocked destination prefixes, tariff effective windows, active carrier profiles, and enabled gateway mappings. Unknown requests return no route. Default public DID ingress, call queues, carrier CDR reconciliation, prepaid balance enforcement, concurrency quotas, emergency dialing policy, lawful intercept, and settlement are **not implemented** by this deployment. Configure those separately before production calling. The GUI does not report a live switch heartbeat.

For browser clients, use `wss://<sip-domain>:7443` in the tenant SIP WSS setting; Sofia's vanilla internal profile exposes WSS on 7443, and the role installs `wss.crt`/`wss.key`. Verify the profile's authenticated calls, TLS chain, DNS and NAT addresses with `fs_cli` before opening traffic. Keep the default public external profile behind the carrier ACL and firewall. Avoid the bundled demo users and default dialplan on any exposed profile; the XML directory binding is exclusive for directory lookups, but validate actual profile behavior and remove unused demonstrations.

If `coturn_enabled: true`, the role provisions coturn with an HMAC shared secret. Set the API `TURN_SECRET` to that same value and configure `TURN_PUBLIC_HOST`; allow TURN 3478 and relay UDP 49160–49260. Configure browser ICE servers and test calls across networks. TURN relays browser candidates; FreeSWITCH itself does not use TURN as a client.

## Recovery

Disable the tenant switch lookup in the GUI to stop new directory and dialplan results. Disable a gateway mapping to stop new outbound selections. Existing calls are not disconnected. The role makes no irreversible database changes beyond the API's idempotent migration. Back up the switch configuration and MySQL before rollout.

## Fleet operations from the super administrator dashboard

`deployment/controller-bootstrap.sh` installs the application and switch, then enables the private
`olamide-fleet-runner.timer` on a Linux controller with active systemd. The Windows
`deployment/install-class5.bat` starts the same bootstrap through WSL; a WSL instance
without systemd requires a persistent Linux controller for scheduled jobs.

The controller keeps `deployment/secrets.env`, encrypted
`deploy/ansible/group_vars/switch_nodes/vault.yml`, its Ansible Vault password in
`~/.config/olamide-runner/vault-password`, and SSH keys. These must not be placed
in the web UI or committed. The timer runs once a minute. Inspect failures with
`journalctl -u olamide-fleet-runner.service`; manually inspect the next pass with
`python3 deploy/ansible/runner.py --vault-password-file ~/.config/olamide-runner/vault-password`.

Add a switch in **Server and network operations** using a reviewed IPv4 address,
SSH user and port. Before queuing an installation, establish the host key in the
controller's `known_hosts`, verify Debian 12, SSH key access and passwordless sudo,
and prepare network firewall rules. The GUI queues only health, install and upgrade
jobs, with a health or upgrade interval of at least 5 or 60 minutes respectively.
Jobs are leased and retried at most three times; Ansible provisions one node at a
time. Server inventory, jobs, checks, schedules, events and report thresholds are
stored in MySQL. The UI shows configured capacity, not tested call capacity.

The generated initial inventory uses Caddy's certificate volume on the application
host. For a separate switch, configure `freeswitch_wss_certificate_source:
controller` and `freeswitch_wss_certificate`/`freeswitch_wss_key` in the private
inventory with a trusted certificate for the SIP domain before installing. Its
renewal needs an operator managed certificate deployment process. The API does not
accept arbitrary cron expressions, shell commands, firewall changes or credentials
from the browser. Application nodes can be registered for inventory but the
existing Compose capacity controller handles app replica requests on one host.

### Reviewed firewall jobs

The super administrator can save SSH and carrier SIP CIDR allowlists for a dedicated
Debian switch in the fleet dashboard. A separate `firewall` job runs
`deploy/ansible/firewall.yml`. The private worker checks that its current SSH
source is within the SSH allowlist before applying the validated nftables
ruleset. It rejects a co-located Caddy/Docker host. Keep console access and
verify new SSH, WSS, RTP and carrier SIP connections after a change. A saved
policy is not applied until a deploy-authorized operator queues the job.
