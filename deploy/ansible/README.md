# Kamailio capability deployment

The application catalog tracks 266 upstream module entries, including archived, renamed and experimental modules. It is a discovery inventory, not a claim that Debian 12 packages contain every entry. Bookworm uses an older Kamailio branch than the catalog snapshot. Check the actual package/module version and documentation before commissioning.

## Application workflow
1. Create an enabled switch node in fleet administration.
2. Configure the same 32+ character KAMAILIO_RUNNER_TOKEN on the API and private controller.
3. Copy profiles.example.json to a private controller file and replace the example host, package list and complete configuration directory.
4. Open Administration → Kamailio services, choose the node and reviewed profile, select install/enable state, and queue the plan.
5. Run the controller once or install the sample service/timer after replacing its paths, user and HTTPS URL.
6. Refresh the screen to inspect deployment results and audit evidence.

Controller command:
```sh
python3 tools/kamailio_controller.py --profiles /etc/olamide/kamailio-profiles.json --base https://sip.example.com
```
Load the token from the private environment file. Never place it on the command line or in Git. Host keys are verified by Ansible. Every target must appear in the profile host allowlist. The worker uses an atomic claim and executes fixed playbooks, with no browser-supplied commands.

## Complete profile contract
A profile supplies installedModules, enabledModules, packages and configDirectory. The directory contains a complete reviewed kamailio.cfg plus included routes, certificate references and private dependency configuration. Enabled module choices must match the profile. Packages are restricted to Kamailio package names. External services such as RTPEngine, TURN, databases, charging and IMS peers must be provisioned separately and referenced by this bundle.

A module is not automatically a standalone systemd service. Mutually exclusive TLS backends, deprecated modules and unavailable package builds cannot all be enabled together. The controller reports mismatches as failed with a reason. Do not equate the Select released capabilities button with an approved compatible profile.

The role installs packages with automatic service starts suppressed, snapshots configuration, validates the full configuration before restart, verifies runtime modules and collects a report. An active node requires a drained maintenance window explicitly recorded in the private profile. Rollback restores the prior configuration; package installation is not rolled back. Profile authors must commission tenant isolation, SIP authentication, call routing, media, CDR ingestion and charging against the existing application APIs. The generic capability installer does not invent those provider-specific contracts.

## Direct install and audit
```sh
ansible-playbook -i deploy/ansible/inventory.yml deploy/ansible/site.yml
ansible-playbook -i deploy/ansible/inventory.yml deploy/ansible/audit.yml
```
Reports are stored privately under deploy/ansible/audit-reports unless an output directory is supplied. Code findings contain filenames and line numbers only. The live audit requires the ctl and kex modules for local kamcmd core.modules. It does not export configuration text, credentials or runtime command output.

## Status contract
- Installed: a module shared object exists on the server.
- Configured: installed, loaded in the active process and current configuration validation passes.
- Connected: configured plus a fresh, host/configuration-bound connection-test receipt.
- Tested: connected plus a successful acceptance-test receipt.
- Pending: prerequisites or fresh evidence are absent.

Receipts are operator-authored results from genuine tests, not generated success flags. Store them at /var/lib/olamide/kamailio-acceptance.json, keyed by module ID, with checkedAt, host, configHash, testId, connectionPassed and acceptancePassed. The hash covers files beneath /etc/kamailio; configuration outside this directory must be included in the test ID evidence and retested after changes. Evidence expires after 24 hours.

## Recovery and concurrency
The API serializes claims per node. A controller crash leaves the plan running to avoid an unattended duplicate restart. An operator must inspect actual state before resetting that plan. Reports and plans are tenant scoped; only super administrators may schedule changes to the shared fleet. Ordinary administrators can inspect their tenant's history.

The retired XML switch endpoint returns HTTP 410. Historical database tables and credential utilities remain for data compatibility. The new deployment never uses them.
