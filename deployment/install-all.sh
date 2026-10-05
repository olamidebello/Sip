#!/usr/bin/env bash
# Single entrypoint for a fresh Debian 12 host. Run as root from the server console.
set -euo pipefail
usage() { echo 'Usage: OLAMIDE_DOMAIN=sip.dobhrap.com OLAMIDE_PUBLIC_IP=YOUR_VERIFIED_PUBLIC_IPV4 bash install-all.sh'; }
if [[ "${1:-}" == "--help" ]]; then usage; exit 0; fi
if (( EUID != 0 )); then usage >&2; exit 1; fi
if [[ ! -r /etc/os-release ]]; then echo 'Cannot determine operating system' >&2; exit 1; fi
. /etc/os-release
if [[ "$ID" != debian || "$VERSION_ID" != 12 ]]; then echo 'Debian 12 is required' >&2; exit 1; fi
domain=${OLAMIDE_DOMAIN:-sip.dobhrap.com}
public_ip=${OLAMIDE_PUBLIC_IP:-}
if [[ ! "$domain" =~ ^[a-z0-9.-]+$ || ! "$public_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo 'Set OLAMIDE_DOMAIN and the server provider verified OLAMIDE_PUBLIC_IP' >&2; exit 1
fi
IFS=. read -r -a octets <<< "$public_ip"
for octet in "${octets[@]}"; do
  if (( 10#$octet > 255 )); then echo 'Invalid public IPv4 address' >&2; exit 1; fi
done
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates git
resolved=$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u) || true
if ! printf '%s\n' "$resolved" | grep -Fxq "$public_ip"; then
  echo "DNS for $domain must include $public_ip; found: ${resolved:-none}" >&2; exit 1
fi
# Clone a fresh public source tree; the underlying bootstrap selects a CI-validated SHA.
source_dir=$(mktemp -d /tmp/olamide-install.XXXXXXXX)
trap 'rm -rf -- "$source_dir"' EXIT
git clone --depth 1 --branch main https://github.com/olamidebello/Sip.git "$source_dir/repo"
OLAMIDE_DOMAIN="$domain" OLAMIDE_PUBLIC_IP="$public_ip" \
  bash "$source_dir/repo/deployment/install.sh"
echo "Installation command finished. Check https://$domain/api/health and the service logs."
