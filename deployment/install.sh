#!/usr/bin/env bash
set -euo pipefail
usage() { echo 'Usage: sudo OLAMIDE_DOMAIN=sip.dobhrap.com OLAMIDE_PUBLIC_IP=YOUR_VERIFIED_IP bash deployment/install.sh'; }
if [[ "${1:-}" == '--help' ]]; then usage; exit 0; fi
if (( EUID != 0 )); then usage; exit 1; fi
domain=${OLAMIDE_DOMAIN:-sip.dobhrap.com}
expected_ip=${OLAMIDE_PUBLIC_IP:-}
if [[ ! "$domain" =~ ^[a-z0-9.-]+$ || ! "$expected_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo 'Set a valid OLAMIDE_DOMAIN and verified OLAMIDE_PUBLIC_IP' >&2; exit 1
fi
IFS=. read -r -a ip_octets <<< "$expected_ip"
for octet in "${ip_octets[@]}"; do
  if (( 10#$octet > 255 )); then echo 'Invalid public IPv4 address' >&2; exit 1; fi
done
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
bash "$script_dir/install-ansible.sh"
resolved=$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u)
if ! printf '%s\n' "$resolved" | grep -Fxq "$expected_ip"; then
  echo "Public DNS for $domain must include $expected_ip before TLS deployment; found: ${resolved:-none}" >&2
  exit 1
fi
OLAMIDE_DOMAIN="$domain" OLAMIDE_PUBLIC_IP="$expected_ip" bash "$script_dir/bootstrap.sh"
