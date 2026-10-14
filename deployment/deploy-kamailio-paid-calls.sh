#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root'; exit 1; }
repo=/opt/olamide/repo
stage=$(mktemp -d /tmp/olamide-paid-calls.XXXXXX)
trap 'rm -rf "$stage"' EXIT
cp "$repo/deploy/ansible/kamailio-paid-calls.yml" "$stage/"
cat > "$stage/inventory.ini" <<'INVENTORY'
[switch_nodes]
localhost ansible_connection=local ansible_python_interpreter=/usr/bin/python3
INVENTORY
cat > "$stage/ansible.cfg" <<'CONFIG'
[defaults]
retry_files_enabled=False
interpreter_python=/usr/bin/python3
CONFIG
cd "$stage"
ANSIBLE_CONFIG="$stage/ansible.cfg" ansible-playbook -i inventory.ini kamailio-paid-calls.yml "$@"
