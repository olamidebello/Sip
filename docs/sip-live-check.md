# Live SIP registration and media check

After draining calls, run on the deployed host:

```sh
cd /opt/olamide/repo/deploy/ansible
ansible-playbook -i same-server.inventory.yml sip-live-check.yml --ask-vault-pass -e kamailio_maintenance_approved=true
```

The play imports the existing bridge repair/deployment, starts an installed stopped RTPengine service, pings Kamailio's configured local UDP media-control endpoint, opens the assigned public secure WebSocket and sends a real Digest-authenticated SIP REGISTER. It removes its temporary contact using an expires=0 REGISTER; the contact otherwise expires after 60 seconds. Credentials and Digest headers are never printed. TLS validation stays enabled.

By default it selects an active user in an active workspace, preferring an already active SIP account. It invokes account provisioning before registration and reports missing encryption configuration or pending account activation without printing secrets. Set `sip_check_user_id` to the UUID of a designated test user to select that account. This creates a temporary registration; run when no calls are active and use a test account where the registrar permits only one contact. The playbook restarts Kamailio through bridge deployment. It fails if the media service or explicit local UDP control configuration is missing, if WSS fails, or if authenticated REGISTER fails. It does not blindly replace routing, media interfaces or firewall rules.

Set `sip_rtpengine_service` if the installed service has a name other than rtpengine-daemon. Supply the UUID through `-e sip_check_user_id=...`; do not supply SIP passwords. Three registration attempts allow the account reconciliation worker to catch up.

Successful registration plus a media-control ping does not establish live audio. Sign in on two clients, permit microphone access, call the other user's SIP address, speak in both directions, and repeat across Wi-Fi/mobile networks. Failure requires the browser ICE/RTP statistics and installed media/firewall configuration before modifying NAT, TURN or UDP rules. The observed HTTP bridge supports workspace extension calls; carrier calls are not implemented in it.

Before bridge deployment, the playbook now verifies AES-GCM authentication for every existing encrypted SIP credential against the canonical secrets key and the saved Docker .env key. It retains a valid canonical key. It restores a previous saved key only if it authenticates every credential, backs up the current secrets file privately, and stops if no unique full match exists. It does not regenerate passwords or keys. Run `python3 /opt/olamide/repo/tools/repair_sip_credential_key.py` for a read-only report. Provisioning logs now distinguish a credential-key mismatch from SQL error codes.
