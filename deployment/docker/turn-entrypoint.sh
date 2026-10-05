#!/bin/sh
set -eu
case "${DOMAIN:-}" in *[!a-zA-Z0-9.-]*|'') echo 'Invalid TURN realm' >&2; exit 1;; esac
case "${TURN_PUBLIC_IP:-}" in *[!0-9.]*|'') echo 'TURN_PUBLIC_IP must be an IPv4 address' >&2; exit 1;; esac
echo "$TURN_PUBLIC_IP" | awk -F. 'NF != 4 {exit 1} {for(i=1;i<=4;i++) if($i !~ /^[0-9]+$/ || length($i)>3 || $i+0>255) exit 1}' || { echo 'Invalid TURN IPv4 address' >&2; exit 1; }
TURN_SECRET=${TURN_SECRET:-}
[ "${#TURN_SECRET}" -ge 32 ] || { echo 'TURN_SECRET must have at least 32 characters' >&2; exit 1; }
umask 077
cat > /tmp/olamide-turn.conf <<EOF
listening-port=3478
external-ip=${TURN_PUBLIC_IP}
realm=${DOMAIN}
fingerprint
use-auth-secret
static-auth-secret=${TURN_SECRET}
min-port=49160
max-port=49260
no-tls
no-dtls
no-cli
no-loopback-peers
no-multicast-peers
user-quota=12
total-quota=120
EOF
exec turnserver -c /tmp/olamide-turn.conf --log-file=stdout
