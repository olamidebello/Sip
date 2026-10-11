#!/usr/bin/env bash
# Isolate this playbook from unrelated host/group variables and Vault files.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ "$repo_dir" == /opt/olamide/repo ]] || { echo 'Run the server checkout at /opt/olamide/repo' >&2; exit 1; }
command -v ansible-playbook >/dev/null
run_dir=$(mktemp -d /tmp/olamide-login.XXXXXXXX)
trap 'rm -rf -- "$run_dir"' EXIT
cp "$repo_dir/deploy/ansible/user-login-unattended.yml" "$run_dir/playbook.yml"
cp "$repo_dir/deploy/ansible/user-login.local.yml" "$run_dir/inventory.yml"
printf '[defaults]\ninterpreter_python=auto_silent\nretry_files_enabled=False\n' > "$run_dir/ansible.cfg"
cd "$run_dir"
ANSIBLE_CONFIG="$run_dir/ansible.cfg" ansible-playbook -i "$run_dir/inventory.yml" "$run_dir/playbook.yml" "$@"
