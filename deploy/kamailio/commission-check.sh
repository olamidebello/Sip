#!/usr/bin/env bash
# Read-only commissioning report. No services are started and no secrets are printed.
set -euo pipefail
failed=0
check_package() { if [[ "$(dpkg-query -W -f='${Status}' "$1" 2>/dev/null || true)" == 'install ok installed' ]]; then
  echo "PASS package $1"; else echo "BLOCKED package $1"; failed=1; fi; }
if [[ "$(id -u)" != 0 ]]; then echo "Run as root on the switch host" >&2; exit 2; fi
echo "Kamailio SIP commissioning report"
echo "Host: $(hostname -f 2>/dev/null || hostname)"
for package in kamailio kamailio-extra-modules kamailio-json-modules kamailio-websocket-modules kamailio-tls-modules rtpengine-daemon; do
  check_package "$package"
done
for service in kamailio rtpengine-daemon; do
  state="$(systemctl is-active "$service" 2>/dev/null || true)"
  echo "$service: $state"
  [[ "$state" == active ]] || failed=1
done
if curl --connect-timeout 2 --max-time 5 --fail --silent http://127.0.0.1:18080/api/health >/dev/null; then
  echo "PASS private API health"
else echo "BLOCKED private API health"; failed=1; fi
if [[ -f /etc/kamailio/kamailio.cfg ]]; then
  if kamailio -c -f /etc/kamailio/kamailio.cfg >/dev/null 2>&1; then echo "PASS installed Kamailio syntax"
  else echo "BLOCKED installed Kamailio syntax"; failed=1; fi
  if grep -Eq 'listen=(udp|tcp|tls):127\.0\.0\.1:5062' /etc/kamailio/kamailio.cfg; then
    echo "BLOCKED public SIP listener (installed configuration is loopback only)"; failed=1
  fi
  if grep -q 'Carrier route not commissioned' /etc/kamailio/kamailio.cfg; then
    echo "BLOCKED carrier dispatch (installed configuration still rejects carrier routes)"; failed=1
  fi
else echo "BLOCKED installed Kamailio configuration missing"; failed=1; fi
if ss -H -lun '( sport = :5060 or sport = :5061 or sport = :5062 )' | grep -q .; then
  echo "SIP UDP listener detected; verify address and firewall before traffic"
else echo "BLOCKED no SIP UDP listener detected"; failed=1; fi
echo "Manual acceptance still required: carrier SIP peering and authentication, public DNS/certificate, RTP ports/NAT, authenticated REGISTER, two-way audio, inbound/outbound calls, failover, CDR and billing."
if ((failed)); then echo "NOT COMMISSIONED"; exit 1; fi
echo "HOST CHECKS PASSED; manual acceptance is still required"
