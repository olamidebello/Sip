#!/usr/bin/env bash
set -euo pipefail

# Read-only host checks. This does not deploy, enable, or modify services.
api_url="${KAMAILIO_API_URL:-http://127.0.0.1:18080}"
if [[ "$api_url" != "http://127.0.0.1:18080" ]]; then
  echo "Expected the private host loopback API at http://127.0.0.1:18080" >&2
  exit 2
fi
for package in kamailio kamailio-extra-modules kamailio-utils-modules kamailio-json-modules kamailio-websocket-modules kamailio-tls-modules rtpengine-daemon; do
  dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -qx 'install ok installed' || {
    echo "Missing package: $package" >&2
    exit 1
  }
done
echo "Kamailio and RTPengine packages: installed"
for service in kamailio rtpengine-daemon; do
  state="$(systemctl is-active "$service" 2>/dev/null || true)"
  echo "$service: $state"
done
if ! curl --connect-timeout 2 --max-time 5 --fail --silent --show-error "$api_url/api/health" >/dev/null; then
  echo "The host-only API bridge is unavailable. Deploy the reviewed API compose changes before testing live SIP." >&2
  exit 1
fi
echo "Host-only API health: reachable"
status="$(curl --connect-timeout 2 --max-time 5 --silent --show-error -o /dev/null -w '%{http_code}' \
  -H 'Content-Type: application/json' --data '{}' "$api_url/api/switch/kamailio/auth")"
if [[ "$status" != 401 ]]; then
  echo "Unexpected unauthenticated adapter response: HTTP $status (expected 401)" >&2
  exit 1
fi
echo "Unauthenticated SIP adapter request: rejected"
echo "Preflight complete. Live registration, media, carrier routing, and billing are not verified."
