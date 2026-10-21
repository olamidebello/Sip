# SIP server and platform firewall

This installer targets the dedicated Debian 12 `sip.dobhrap.com` host, not the separate Olamidepanel hosting server. It requires root SSH access, Docker Compose, a healthy application, and running Kamailio/RTPengine. It preserves existing Docker/NAT/media rules and owns only the `inet olamide_guard` nftables table. It never flushes the host ruleset or disables Docker firewall management.

## Protection layers

* Default-deny host ingress for IPv4 and IPv6, with established connections, loopback, DHCP and essential ICMP/IPv6 discovery preserved.
* Actual SSH listening ports (including the current SSH session port), HTTPS/HTTP, public SIP listeners, RTPengine's configured media range and any active TURN relay range are discovered before activation. Unrecognized listener macros, tunnels, non-bridge Docker networks, or active UFW/firewalld stop deployment for review rather than guessing.
* RTPengine command-line options override its configuration file. The documented 30000–40000 defaults apply when unset. Active TURN requires explicit relay bounds. The recorder's loopback-only 5062 listener is not opened publicly. The Caddy container may reach Kamailio's private TCP 8088 listener through Docker bridge interfaces.
* Forwarded external traffic to containers is restricted by the **original published port**, allowing 80/443 only. Other container-published ports, including database and private API ports, are blocked externally. Container egress and bridge communication remain governed by Docker's existing rules. This policy is for a server, not a VPN router or a Swarm host.
* Per-source SSH connection pacing, per-source SIP packet flood limits, web TCP SYN pacing, SYN cookies and source-route/redirect protections. Known carrier source ranges are exempt from the SIP packet pacing only; Kamailio still performs its existing authentication/ownership checks. RTP media is not packet-rate-limited so concurrent calls are not throttled as if they were abusive requests.
* During the timed trial, Fail2ban's SSH jail bans repeated authentication failures (six in ten minutes, initially one hour, escalating up to one day). It does not interpret wallet, location, billing or other normal call rejection messages as intrusion attempts. Existing non-SSH jails are preserved.
* Caddy adds HSTS, no-sniff, same-origin framing, referrer and narrowly scoped CSP protections without restricting microphone, camera, uploads, scripts or WebSockets. The private `/api/switch/kamailio/*` paths return 404 on public HTTPS. Private switch traffic continues through the loopback bridge.
* Existing application login/API rate limits are retained. These changes are not a full HTTP WAF or a guarantee against application vulnerabilities. Volumetric DDoS mitigation requires the hosting provider's upstream network protection; a server firewall cannot recover a saturated network link.

## Activation and rollback

Run the pinned Ansible playbook from your existing SSH connection. It backs up Caddy and firewall state, validates Python policy tests, validates/builds the edge configuration, checks HTTPS health and headers, checks the nftables candidate with `nft -c`, then applies the network policy atomically.

The policy initially has a **ten-minute automatic rollback**. Keep the original SSH session open, open a **new SSH connection**, and run:

```sh
sudo --preserve-env=SSH_CONNECTION olamide-firewall confirm
sudo olamide-firewall status
```

Confirmation from the original SSH connection is refused. The new connection proves a fresh SSH handshake through the policy; local HTTPS health is checked again. Confirmation persists the approved policy and network sysctls. The SSH jail is already active during the timed trial, so the new connection tests that layer too. A reboot during the trial restores the prior network and SSH configuration before normal network services start. If no confirmation arrives, or activation fails its checks, the previous owned firewall table is restored. Other firewall and Docker tables are never replaced. Persistent firewall/SSH/sysctl files touched during confirmation are also restored if confirmation fails. The separately validated Caddy security-header change remains in place.

Read-only checks and emergency rollback **while a change is pending**:

```sh
sudo olamide-firewall status
sudo nft list table inet olamide_guard
sudo fail2ban-client status sshd
sudo journalctl -k --since '10 minutes ago' --grep OLAMIDE_FW --no-pager
sudo olamide-firewall rollback
```

A rollback command without a pending change is a no-op. Do not use `nft flush ruleset` or stop Docker to remove this policy. For a confirmed-policy recovery using the provider console, disable `olamide-firewall.service` and delete only `nft delete table inet olamide_guard`; restore the previous approved policy and service state from the recorded backup before re-enabling it. The rollback backup includes the previous owned table and the full ruleset for inspection, not for blindly restoring over Docker.

After confirming, test browser sign-in, SIP registration, an ordinary outbound/inbound call, two-way audio, video if used, voicemail and TURN if enabled. Do not test emergency calling. Automated policy tests and local health checks do not prove end-to-end carrier/media reachability. Review configuration again when changing public SIP, SSH, TURN or RTP ports; rerun the installer to generate an updated policy with a fresh rollback checkpoint.

Files: `/etc/olamide/firewall/approved.nft`, `/var/lib/olamide/firewall/status.json`, `/etc/fail2ban/jail.d/olamide-sshd.local`, `/etc/sysctl.d/70-olamide-network-security.conf`. Backups are root-private under `/opt/olamide/backups/firewall-*`.
