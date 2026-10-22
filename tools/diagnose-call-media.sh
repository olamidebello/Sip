#!/bin/bash
set -u
cd /opt/olamide/repo/deployment/docker || exit 1
echo 'MEDIA SERVICES'
systemctl is-active kamailio rtpengine || true
docker compose --profile turn ps api web turn
echo 'RTP CONFIGURATION'
grep -E '^[[:space:]]*(interface|port-min|port-max|listen-ng)[[:space:]]*=' /etc/rtpengine/rtpengine.conf || true
echo 'PUBLIC LISTENERS'
ss -lntup | grep -E ':(443|3478|5349|2223)[[:space:]]' || true
echo 'FIREWALL'
ufw status 2>/dev/null || true
echo 'TURN ADDRESS CONFIGURATION (NO SECRETS)'
docker compose --profile turn exec -T turn sh -c "grep -E '^(listening-ip|relay-ip|external-ip|listening-port|min-port|max-port|no-tls|no-dtls)=' /tmp/olamide-turn.conf" || true
echo 'RTP ENGINE JOURNAL'
journalctl -u rtpengine --since '-3 minutes' --no-pager -n 30 || true
echo 'NEXT: Keep a test call connected for the packet counter below.'
if command -v tcpdump >/dev/null; then
 echo '30 second aggregate packet counts; packet contents are not printed.'
 timeout 30 tcpdump -nn -q -i any 'udp and (portrange 30000-40000 or portrange 49160-49260 or port 3478)' 2>/dev/null | awk '
 /300[0-9][0-9]|3[1-9][0-9][0-9][0-9]|40000/ {rtp++}
 /491[6-9][0-9]|492[0-5][0-9]|49260/ {relay++}
 /\.3478/ {turn++}
 END {print "RTP range packets:",rtp+0; print "TURN relay range packets:",relay+0; print "TURN listener packets:",turn+0}'
else echo 'tcpdump unavailable; no packet capture performed.'; fi
