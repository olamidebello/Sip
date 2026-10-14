# Flowroute default outbound gateway

The default outbound provider policy remains Flowroute only, with no carrier fallback. Local subscribers continue registering to sip.dobhrap.com, never to Flowroute. SIP trunk credentials and inventory API keys are separate.

Super admin → Carrier credentials now contains **Flowroute outbound SIP gateway**. Save an IP or digest profile, one of the two official PoPs, eight-digit username and Tech Prefix, public egress IP, authorized caller ID and capacity. Passwords are write-only, AES-256-GCM encrypted using the existing provider credential key with tenant/provider binding. Blank password preserves the stored secret. A revision check rejects conflicting edits; a tenant advisory lock prevents rotation during activation. Deactivate Flowroute before rotating settings. This changes Olamide's saved credentials; it cannot reset Flowroute's own password remotely.

IP mode requires the exact public egress IP in Flowroute Manage → Interconnection → Outbound Allowed IPs. Confirm that setting in the form. Outbound Request-URI user is `TECHPREFIX*E164`; registration is disabled. IP-mode adapter payloads omit the password. Digest mode uses the saved SIP username/password and a normal E.164 destination, without attempting subscriber registration at the carrier.

## Private attachment import

Upload the supplied registration PDF to `/root/flowroute.pdf` on the server using your SSH client's file transfer. Do not add it to Git. After deployment CI succeeds:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-flowroute-gateway.sh -e flowroute_credentials_pdf=/root/flowroute.pdf
```

The installer deploys API/web with the existing CI gate and database backup, installs a PDF reader, preserves or securely generates the provider key and imports SIP credentials over container stdin. It prints no credentials. Existing GUI settings are preserved on repeated imports. If multiple active super administrators exist, select a tenant with `-e flowroute_tenant_id=UUID`; that tenant must have exactly one active super administrator.

The import defaults to IP authentication, US-East-VA and server IP 154.29.77.102, with allowlist confirmation false and caller ID unset. The PDF does not prove those commissioning requirements. Set them in the GUI and click **Provision default outbound gateway**. For an unattended deployment after confirming the IP in Flowroute Manage, supply `-e flowroute_allowed_ip_confirmed=true -e flowroute_caller_id=+YOUR_AUTHORIZED_NUMBER`. The importer automatically attempts commissioning when those requirements are present; it reports pending activation if the adapter is missing or refuses the configuration. Repeated imports preserve settings already managed in the GUI.

## Switch provisioning contract

Provisioning stages the Flowroute trunk automatically and invokes the existing private HTTPS carrier adapter. No adapter is installed by this playbook: it must already be configured in Carrier adapters and implement the following contract. No profile is marked active just because credentials were saved.

An `activate` request includes `flowrouteTrunk`: configurationRevision, authenticationMode, official host, port 5060, UDP transport, register false, Tech Prefix, public IP, caller ID, defaultOutbound flowroute, fallback false and destinationFormat. Digest mode additionally includes the SIP password, over the authenticated private HTTPS connection only. Never log this payload. Switch rules must enforce existing subscriber authentication, tenant isolation, active subscriptions, destination/fraud policies, rate and capacity limits, trusted caller ID and commissioned RTP/media handling before relaying PSTN INVITEs.

The adapter must apply the exact configuration and return `status: active`, the same `configurationRevision` and `authenticationMode`, plus `defaultOutbound: flowroute`. Missing/mismatched acknowledgment fails activation. Existing adapters that do not support this new contract must be updated; generic status-only acknowledgments are refused for these profiles. Acknowledgment is not a live call test. Confirm actual outbound INVITE, answer, hang-up, DTMF, two-way audio, caller ID and billing with a controlled paid test call.

This work does not configure Flowroute's remote IP allowlist through SIP credentials, install an arbitrary dialplan into an unknown running Kamailio configuration, or enable free external calls. Inventory, DID purchasing and SMS continue using separate REST credentials.

Official sources: https://support.bcmone.com/docs/set-up-ip-based-authentication-for-outbound-calls and https://support.bcmone.com/docs/flowroute-general-pbx-or-phone-system-setup-guide

## Interactive server credential entry

Run from a real SSH terminal:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-flowroute-gateway.sh --interactive
```

The installer prompts for the eight-digit SIP username/Tech Prefix, hidden and confirmed SIP password, PoP, public IP, authorized caller ID, IP allowlist confirmation, capacity and optional tenant ID. It defaults to IP authentication and needs no PDF. Passwords go through container stdin with Ansible no_log, never shell arguments, environment overrides or tracked files. Saved credentials are encrypted using the existing provider key. Interactive input replaces saved SIP settings using their current revision, but refuses to change an active Flowroute trunk; deactivate it first in the GUI. PDF-mode imports still preserve existing GUI settings.

Provisioning is attempted automatically when an authorized caller ID and IP allowlist confirmation are supplied. Missing or incompatible switch adapters leave activation pending. User subscription, SIP registration and outbound billing policies remain in effect. This prompt does not grant calling credit or add money to wallets.


## Unattended deployment with GUI management (default)

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-flowroute-gateway.sh
```

This default path builds and deploys the API/web, applies migrations with backup and exact-commit CI validation, prepares the private encryption key, and checks API health. It requires no PDF, credential variables or interactive terminal. No existing SIP settings are overwritten by this installation.

After installation, Super admin → Carrier credentials → Flowroute outbound SIP gateway manages username/password, separate Tech Prefix, IP/digest authentication, PoP, egress IP, caller ID, capacity and allowlist confirmation. The same panel shows trunk host/port, gateway lifecycle state, assigned adapter health, provisioning operation history and errors. Provision activates only after switch acknowledgment. Deactivate releases the commissioned gateway through the switch adapter; edit/rotate afterward. Remove saved SIP credentials requires deactivation, the current revision and confirmation, preserves inventory API keys and records an audit event. Status displays adapter state, not a media/call success claim.

PDF imports remain available with `--pdf-import -e flowroute_credentials_pdf=/root/flowroute.pdf`; the older PDF-variable invocation is also recognized. `--interactive` remains an optional alternative. The installer deploys application management; it does not install a compatible trunk adapter into an unknown running switch. Actual call termination needs that adapter, the remote Flowroute allowlist and authorized caller ID.

## Private adapter targets in the GUI

Super admin → Carrier adapters now has a private target editor. Enter a target key, the HTTPS endpoint of your deployed provisioning adapter, and its authentication token (at least 32 printable characters). Save to populate the target selector without editing environment files or restarting the API. Tokens are encrypted and write-only; blank token retains the saved token. Targets are tenant scoped, revision checked and audited. Only super administrators can manage their endpoint/token. Existing server-configured targets remain available; a GUI entry with the same key overrides that target for this tenant.

Deactivate assigned gateways and disable adapter nodes before editing a target. Rotation clears previous health checks. Delete referencing nodes before removing a GUI target. An environment target with the same key remains available after a GUI override is removed. Add a node using the saved target, check health and enable it before carrier provisioning. Saving a target registers an existing adapter endpoint; it does not install the adapter service itself. Mobile text/code wraps within the viewport, and an empty selector explains how to add a target.
