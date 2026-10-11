Same-server Kamailio and RTPengine deployment
===========================================

The application server can also be a SIP edge with a media relay. The GUI queues
the `same-server` private profile; it never runs arbitrary shell commands or
receives database or carrier secrets. Create an enabled switch node in Server
fleet using this server's public IP, root user, and the node's UUID. In Kamailio
services choose that node and click Select same-server SIP and media profile,
then queue the installation. The local controller requires the selected host IP
to be an address of its own machine.

Install the controller as root (no sudo required):

    apt-get update
    apt-get install -y ansible-core
    bash /opt/olamide/repo/deploy/ansible/install-local-controller.sh

Before installing it, copy the same-server private profile example to
/etc/olamide/kamailio-profiles.json and fill every host-specific value. Keep it
root-owned, mode 0600. Copy a complete, reviewed Kamailio configuration bundle to
its configDirectory, including authentication database settings, SIP realm,
trusted carrier routes, anti-relay policy, websocket Origin checks, registrar
contact alias handling, RTPengine offer/answer/delete routing and RPC socket.
Secrets must remain in private files, never in Git. The media configuration
example uses loopback control on 2223 and userspace relay on UDP 30000–39999.
Debian's rtpengine-daemon service is the default; match an existing vendor service
and package explicitly rather than running a second competing daemon.

For direct local deployment, use the inventory example as a private inventory,
set the real application node UUID, and run:

    ansible-playbook -i /etc/olamide/same-server.yml /opt/olamide/repo/deploy/ansible/same-server.yml

Set maintenanceApproved only during a drained maintenance window. Configuration
cutovers restart signaling/media and interrupt calls. The playbook backs up relay
and Kamailio configuration, verifies an RTPengine NG ping, validates Kamailio and
its loaded modules, permits the Docker bridge to private 8088, permits the agreed
media UDP range, and manages SIP_WS_UPSTREAM in private compose environment files.
The tracked Caddyfile owns /ws permanently, so updates preserve the proxy route.
UFW must already be active with SSH/HTTPS policies; the playbook does not enable
or flush it. Provider firewalls must permit HTTPS and the agreed media range.

If the server still has the four-line manual Caddyfile patch, preserve it in a
stash before pulling this release. After installing this release and commissioning
the environment upstream, leave that old patch stashed; the route is now managed.

Transport success is not production acceptance. The controller fails if public
DNS does not publish the host A record. For sip.dobhrap.com all four authoritative
mysecurecloudhost nameservers previously returned NXDOMAIN: repair the DNS zone
at its provider. Local hosts-file resolution is insufficient.

Before production traffic, independently verify SIP registration, rejected wrong
credentials, rejected unauthenticated relay, two-way WebRTC/carrier audio and DTMF,
NAT behavior, credential provisioning/revocation, billing reservation/settlement,
fraud limits, external TLS, TURN where required, backup restore, monitoring and
load capacity. Acceptance remains pending without test evidence. Installing
Kamailio modules does not provide voicemail, IVR, conferencing or a complete
ASTPP-equivalent billing platform.

The private example includes same-server, same-server-trunk, same-server-mail,
same-server-pbx and carrier-grade profiles. The GUI has a corresponding selection
button for each. Trunk profiles configure carrier CIDR firewall rules; replace
192.0.2.0/24 documentation values with provider-published networks before use.
A configured module is not a functional carrier route: the reviewed Kamailio
bundle must implement tenant authorization, trusted-carrier matching, outbound
policy, dispatcher failover, transaction handling, media and accounting.

Mail profiles deploy Postfix, Dovecot, Rspamd and Redis using complete private
bundles. Include authenticated submission on 587 with mandatory STARTTLS,
loopback authentication sockets, encrypted IMAP on 993, virtual mailbox domains
and users, quotas, LMTP delivery, spam filtering and DKIM signing. Publish MX,
A, SPF, DKIM and DMARC; request PTR from the server provider and verify outbound
25 availability. The controller checks configuration, TLS protocol availability
and MX publication. It does not create mailbox passwords, replace the existing
Resend verification delivery, or supply a send/receive mailbox GUI. Those remain
implementation and acceptance requirements. Protect mail keys for daemon access
and arrange certificate renewal; copying a static certificate is insufficient.

PBX profiles build a private pinned official Asterisk release artifact rather
than assuming a Debian 12 Asterisk package exists. Supply the version, archive
and independently verified checksum; placeholders fail closed. The reviewed
configuration must include private PJSIP on 127.0.0.1:5062 behind Kamailio,
strict tenant dialplans, voicemail, queues, IVR, schedules and conference rooms.
The role checks expected runtime modules, not functional calling. Full GUI PBX
operations require a commissioned adapter and authenticated tenant configuration
synchronization; no adapter is created here. PBX binary upgrades do not have
automatic rollback: snapshot the host and drain calls before commissioning.

The carrier-grade profile additionally requires a private acceptance receipt at
/etc/olamide/carrier-acceptance.json with checkedAt, host, nodeId and configHash
matching the fresh audit, concurrentCalls at least 500, and passing tests named
registration, invalid_credentials_rejected, unauthenticated_relay_rejected,
two_way_audio, dtmf, carrier_inbound, carrier_outbound, billing_reservation,
billing_settlement, fraud_limits, credential_revocation, backup_restore,
monitoring_alert, failover, smtp_delivery, imap_login, spf_dkim_dmarc and ptr.
A receipt is evidence recorded by a trusted operator after actual tests; do not
fabricate it. The controller rejects missing, stale or mismatched receipts.
A single host cannot provide host-level high availability; failover requires a
second failure domain. This automation does not establish complete carrier-grade
or ASTPP feature parity. The readiness GUI deliberately lists outstanding work.

## Two additional FreeSWITCH backends

The GUI profile `same-server-freeswitch-cluster` queues the same reviewed controller deployment. Populate the private profile with a digest-pinned FreeSWITCH image using `/usr/local/freeswitch`, two complete private configuration bundles, independent ESL passwords, and maintenance approval. The standalone playbook is `deploy/ansible/freeswitch-cluster.yml`; use the same private inventory with these variables.

Instances fs2 and fs3 use loopback SIP 5092/5093, loopback ESL 8092/8093, and separate public RTP ranges 40000–44999 / 45000–49999. The validator rejects default credentials, public management listeners, conflicting profile ports and malformed XML. Reviewed configurations must persist recordings, voicemail and databases under `/usr/local/freeswitch/storage`; the image must support this layout. Drain calls before replacement. Take a host snapshot and preserve configuration/storage for rollback.

Configure Kamailio dispatcher destinations `sip:127.0.0.1:5092` and `sip:127.0.0.1:5093` with OPTIONS probing, authenticated routing, accounting, capacity limits and tested failure handling. This deployment does not invent dialplans or enable traffic to untested destinations. CLI status checks establish process health only. Registration, two-way media, DTMF, transfers, voicemail, IVR, queues, conferences, recording, carrier calls, billing, fraud controls, overload, restart and backup restoration remain pending until exercised. Three processes on one host do not provide host-level high availability.

## Make deployed services visible in the GUI

Run `ansible-playbook -i /etc/olamide/same-server.yml /opt/olamide/repo/deploy/ansible/service-gui.yml` after populating the private inventory. The same-server playbook also imports this step. It installs a once-per-minute systemd collector and mounts only its sanitized output read-only into the API. Super administrators see Kamailio, RTPengine, both FreeSWITCH backends, PBX, SMTP, IMAP and email filtering in the switch commissioning panel, with links to existing carrier and provisioning controls. Evidence expires after three minutes. Missing services remain visible as pending.

This inventory is monitoring and commissioning visibility, not a SIP provisioning or termination adapter. Process health does not activate routes, create accounts, authorize calls or mark full services tested. Private adapters, reviewed routes and real end-to-end acceptance remain required. No ESL password or server credential is sent to the browser.

## Flowroute outbound policy

Flowroute is the sole default outbound PSTN provider. Application quote selection excludes every other provider and fails closed when Flowroute is inactive or lacks a matching rate. Carrier adapter commissioning requests carry the same `terminationPolicy` contract. Other providers remain available for inbound DID services. Local extension calls stay local.

`flowroute-policy.yml` publishes the private switch policy file. Reviewed Kamailio and FreeSWITCH adapters must consume and enforce it; this file alone does not modify a running dialplan. Configure Flowroute authentication, approved PoP, caller ID, rates, capacity and billing controls; test outbound calls on each switch before traffic activation. The retired XML HTTP endpoint is not re-enabled by this change.

## Automatic Flowroute rate checks and 30% selling markup

The admin API `POST /api/admin/rates/flowroute/sync` enables a tenant's six-hour published-default CSV refresh and queues the first check within a minute. `POST /api/admin/rates/flowroute/sync/disable` stops it. A bounded HTTPS download discovers the current official rate-deck link; validation/import failure preserves the previous deck and retries after fifteen minutes. A database advisory lock coordinates API replicas. SHA-256 deduplication and transactional tenant locks prevent competing active decks.

Manual CSV imports use the uploaded buying prices and set selling prices to buying × 1.30, rounded to six decimal places. Manual import disables automatic published-default refresh, protecting account-specific rates. Re-enabling refresh explicitly switches back to public default rates. Admins can query buying and selling rates at `/api/admin/rates/flowroute/search?prefix=12125550123`; user searches expose selling rates only. Billing intervals are preserved and future-effective rows are excluded from current quotes. These are quote decks: live billing and tariff adapter commissioning are separate.

## Automatic SIP account creation and password-verified registration

`deploy/ansible/sip-accounts.yml` enables the same-server provisioning backend after a reviewed Kamailio cutover. Supply `sip_registration_config_source` containing a complete configuration. It must load auth/auth_db/registrar/usrloc, include `#!include_file "olamide-auth.cfg"` after module loading, and invoke `route(OLAMIDE_REGISTER);` first inside `request_route`. Remove conflicting auth_db modparams from that bundle. Set the normal expected modules and drained maintenance approval. The playbook validates the hook, builds/migrates the API, creates a read-only MySQL view user, generates the private authentication include, validates/restarts Kamailio with rollback, then enables `SIP_PROVISION_MODE=kamailio_local`.

MySQL's authentication connection is published only on host loopback port 3307. Ensure that port is available and Docker firewall rules preserve loopback-only access. The read-only database identity can SELECT only the SIP authentication view. Existing application SIP encryption keys are preserved. The API stores HA1/HA1b digest material, never plaintext SIP passwords in the authentication table; protect digest material as credentials.

The existing reconciliation worker creates accounts for verified active users and retries provision within thirty seconds. It writes local digest credentials before activating the account. The auth view excludes inactive users, inactive tenants and suspended SIP accounts, so new REGISTER authentication is denied after revocation. Existing registrations, dialogs and already-established calls need separate runtime eviction/termination controls.

Users choose My SIP account → Verify and connect SIP account, enter their application password and keep automatic registration checked. The existing password-verification endpoint releases their SIP credential only after verification; the browser sends SIP REGISTER to `wss://<application-host>/ws` with digest authentication. SIP registration uses a distinct generated SIP password, not the application login password. Incorrect SIP passwords are challenged/rejected, and attempts to register another username are denied. LDAP accounts still need an implemented reauthentication/credential-reveal flow; the current password verification is for local accounts.

Live acceptance remains required: confirm email verification before provisioning, tenant isolation, unsigned REGISTER challenge, wrong password denial, successful REGISTER, contact expiry/reconnect, suspended-account denial, and two-way calls. Browser registration and Kamailio configuration have not been tested on the live host from this environment. The REGISTER hook must be integrated with the reviewed WebSocket/NAT routing profile; do not replace it with a default open-relay configuration.
