#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ "$repo_dir" == /opt/olamide/repo ]] || { echo 'Run from /opt/olamide/repo' >&2; exit 1; }
exec 9>/run/olamide-update.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
command -v ansible-playbook >/dev/null
run_dir=$(mktemp -d /tmp/olamide-number-porting.XXXXXXXX)
trap 'rm -rf -- "$run_dir"' EXIT
cp "$repo_dir/deploy/ansible/number-porting.yml" "$run_dir/playbook.yml"
printf '[switch_nodes]\nlocalhost ansible_connection=local\n' > "$run_dir/inventory.ini"
printf '[defaults]\ninterpreter_python=auto_silent\nretry_files_enabled=False\n' > "$run_dir/ansible.cfg"
cd "$run_dir"
ANSIBLE_CONFIG="$run_dir/ansible.cfg" ansible-playbook -i inventory.ini playbook.yml "$@"
