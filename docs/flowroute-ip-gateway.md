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
