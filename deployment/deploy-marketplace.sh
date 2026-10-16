#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ "$repo_dir" == /opt/olamide/repo ]] || { echo 'Run from /opt/olamide/repo' >&2; exit 1; }
(( EUID == 0 )) || { echo 'Run as root' >&2; exit 1; }
exec 9>/run/olamide-update.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
bash "$repo_dir/deployment/install-ansible.sh"
run_dir=$(mktemp -d /tmp/olamide-marketplace.XXXXXXXX)
trap 'rm -rf -- "$run_dir"' EXIT
for play in marketplace messenger-features; do cp "$repo_dir/deploy/ansible/$play.yml" "$run_dir/$play.yml"; done
cp "$repo_dir/deploy/ansible/user-login.local.yml" "$run_dir/inventory.yml"
printf '[defaults]\ninterpreter_python=auto_silent\nretry_files_enabled=False\n' > "$run_dir/ansible.cfg"
cd "$run_dir"
ANSIBLE_CONFIG="$run_dir/ansible.cfg" ansible-playbook -i "$run_dir/inventory.yml" "$run_dir/marketplace.yml" "$@"
