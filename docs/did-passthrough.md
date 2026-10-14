# Assigned outbound DID installation

Run as root after the exact main commit passes deployment CI:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-did-passthrough.sh
```

Requires the existing paid-call backend, running Kamailio, billing queue, Docker Compose and Ansible. Installs API code and additive call identity columns, stages recognized Kamailio configuration, validates the entire configuration with `kamailio -c`, backs up MySQL and routing, checks API/RPC health, and restores the previous API image, private assignment policy and switch configuration on cutover failure. Backups remain under `/etc/olamide/did-backup-*`. No live test call is placed. Calls in progress can be interrupted by the switch restart: deploy in a maintenance window.

The default installation preserves existing Flowroute behavior for tenants without a policy. It cannot infer number ownership or provider account permission. To enable per-user selection, create a private JSON file on the server, outside Git, with this structure, replacing every example identifier/number and evidence reference with verified values:

```json
{
  "version": 1,
  "tenants": {
    "11111111-1111-1111-1111-111111111111": {
      "assignments": [
        {
          "userId": "22222222-2222-2222-2222-222222222222",
          "number": "+12145550123",
          "provider": "flowroute",
          "authorized": true,
          "evidence": "Reference to verified carrier assignment"
        },
        {
          "userId": "33333333-3333-3333-3333-333333333333",
          "number": "+12145550124",
          "provider": "didww",
          "authorized": true,
          "evidence": "Reference to verified DIDWW assignment and outbound CLI permission"
        }
      ],
      "didww": {
        "host": "nyc.us.out.didww.com",
        "ipOnlyApproved": true,
        "allowedIpConfirmed": true,
        "cliAuthorized": true,
        "maxConcurrentCalls": 10
      }
    }
  }
}
```

List all permitted callers for each configured tenant: an unassigned user in that tenant is denied, without fallback to the fixed Caller ID. One DID per user and unique DIDs are enforced. The authenticated SIP user and tenant select the identity; browser SIP identity headers cannot choose it. The API records caller ID, provider and host with each reservation. Repeated INVITEs cannot change identity mid-reservation. Do not treat a quote, reservation, SIP username, or unverified inventory entry as proof of DID ownership.

```bash
chmod 600 /root/outbound-dids.json
bash deployment/deploy-did-passthrough.sh -e did_policy_file=/root/outbound-dids.json
```

Ansible installs the private policy root-owned, group 1000, mode 0640 in the existing read-only API inventory bind mount. The image's `node` user (UID/GID 1000) can read it. Invalid installed policy fails closed for all paid calls. A missing file preserves legacy behavior. Policy files contain no SIP passwords or API keys. Install the policy through this playbook to retain validation and rollback; do not change it mid-call.

## Carrier prerequisites

Flowroute uses the already commissioned IP-authenticated gateway, authorized egress IP, Tech Prefix, active Flowroute rate deck and funded subscribed user. Its saved fixed caller ID is still required for gateway commissioning; assigned DIDs replace it per call after installation.

DIDWW is supported here only with **support-approved IP-Only authentication, no Tech Prefix, UDP/5060**. The normal Credentials & IP-Based trunk requires digest and is intentionally refused by this installer. Obtain IP-Only activation from DIDWW, configure the server's public signaling/RTP IPs and CLI permission in DIDWW, and confirm the three policy flags only afterward. No remote provider settings are changed by Ansible. Use `Send Original CLI` if passing authorized external-provider numbers; otherwise limit CLI to eligible account numbers. Domain endpoints are restricted to the seven documented regional outbound hosts.

DIDWW calls need an active DIDWW rate deck in the existing carrier rate tables; the API never charges Flowroute prices for DIDWW calls. Fraud barring, USD wallet reservations, subscription checks, call duration limits and settlement remain enforced. Capacity is bounded using the existing tenant-wide active-call count (conservative across carriers). There is no automatic carrier failover. API/RPC health is not proof of successful provider termination: verify controlled calls for Caller ID, answer/hangup, DTMF, two-way audio, and reconciled charges.

Official references:
- https://support.bcmone.com/flowroute-support/docs/how-do-i-set-the-caller-id-number-i-want-to-transmit
- https://doc.didww.com/voice/outbound-trunks/outbound-trunk-reference.html
- https://doc.didww.com/voice/outbound-trunks/outbound-sip-information.html

## Automatic DIDWW IP-only prerequisite installation

`deployment/deploy-didww-ip-only.sh` installs Python, CA certificates and DNS tools; checks existing Kamailio, RTPengine and billing-queue services; verifies a production DIDWW trunk via API; preserves existing IP entries while adding the exact signaling/media public IP; configures `send_original_cli`; reads back all changes; prepares the private assignment policy; and invokes the validated passthrough deployment. It does not install a second SIP/media stack, replace existing firewall rules, change spending limits, create paid numbers, import guessed rate prices, activate blocked trunks, or grant IP-only approval. Keep the existing SIP/RTP firewall rules consistent with DIDWW's published networks and the configured local RTPengine media port range.

Create `/etc/olamide/didww-ip-only.json`, root-owned, mode 0600:

```json
{
  "trunkId": "REPLACE_WITH_EXISTING_DIDWW_OUTBOUND_TRUNK_UUID",
  "tenantId": "REPLACE_WITH_TENANT_UUID",
  "publicIp": "154.29.77.102",
  "host": "nyc.us.out.didww.com",
  "maxConcurrentCalls": 10,
  "approvalReference": "REPLACE_WITH_DIDWW_IP_ONLY_APPROVAL_REFERENCE",
  "cliRightsConfirmed": true,
  "assignments": [
    {
      "userId": "REPLACE_WITH_USER_UUID",
      "number": "+12145550123",
      "provider": "didww",
      "authorized": true,
      "evidence": "REPLACE_WITH_VERIFIED_NUMBER_RIGHTS_REFERENCE"
    }
  ]
}
```

The JSON is a template: replace every example, and confirm rights before setting `cliRightsConfirmed` and `authorized` to true. Production `DIDWW_API_KEY` must already be in `/etc/olamide/secrets.env`. SIP passwords are unnecessary for approved IP-only mode. The script reads the API key privately and never logs it. A digest trunk is rejected rather than automatically converted: DIDWW support must first authorize IP-only. A nonempty Tech Prefix, unrestricted IP list, inactive trunk or exceeded spending threshold also blocks commissioning.

```bash
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-didww-ip-only.sh
```

Existing Flowroute assignments are retained; assignments explicitly supplied for the same tenant/user are replaced with the verified DIDWW assignment. Provider attribute snapshots are retained under `/etc/olamide/didww-prerequisites-backups/`. Provider-side allowlist/CLI changes are retained if subsequent local deployment fails; the local installer restores its previous API/policy/routes. Review the private provider snapshot before manually restoring remote settings. No paid test call is placed. Missing rates, wallet credit or subscription still deny calls.
