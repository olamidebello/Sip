#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
command -v ansible-playbook >/dev/null || { echo 'Install ansible before running this deployer.' >&2; exit 1; }
exec ansible-playbook -i 'localhost,' -c local "$repo_dir/deploy/ansible/wallet-geofence-local.yml" "$@"
