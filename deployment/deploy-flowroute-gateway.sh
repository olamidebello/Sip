#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ "$repo_dir" == /opt/olamide/repo ]] || { echo 'Run from /opt/olamide/repo' >&2; exit 1; }
play_name=flowroute-gateway-gui
if [[ "${1:-}" == --interactive ]]; then
  [[ -t 0 && -t 1 ]] || { echo 'Interactive setup requires an SSH terminal' >&2; exit 1; }
  play_name=flowroute-gateway-interactive
  shift
fi
if [[ "${1:-}" == --pdf-import ]]; then
  play_name=flowroute-gateway
  shift
elif [[ "$play_name" == flowroute-gateway-gui && "$*" == *flowroute_credentials_pdf* ]]; then
  play_name=flowroute-gateway
fi
exec 9>/run/olamide-update.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
command -v ansible-playbook >/dev/null
run_dir=$(mktemp -d /tmp/olamide-flowroute-gateway.XXXXXXXX)
trap 'rm -rf -- "$run_dir"' EXIT
for play in "$play_name" messenger-features; do cp "$repo_dir/deploy/ansible/$play.yml" "$run_dir/$play.yml"; done
cp "$repo_dir/deploy/ansible/user-login.local.yml" "$run_dir/inventory.yml"
printf '[defaults]\ninterpreter_python=auto_silent\nretry_files_enabled=False\n' > "$run_dir/ansible.cfg"
cd "$run_dir"
ANSIBLE_CONFIG="$run_dir/ansible.cfg" ansible-playbook -i "$run_dir/inventory.yml" "$run_dir/$play_name.yml" "$@"

