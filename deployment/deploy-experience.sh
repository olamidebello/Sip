#!/usr/bin/env bash
set -euo pipefail
[[ $# == 2 ]] || { echo 'Usage: deploy-experience.sh INVENTORY PRIVATE_CONFIG.yml' >&2; exit 2; }
repo_root=$(cd "$(dirname "$0")/.." && pwd)
command -v ansible-playbook >/dev/null || { echo 'Install ansible-core on the deployment controller first' >&2; exit 1; }
exec ansible-playbook -i "$1" "$repo_root/deployment/ansible/whatsapp-experience.yml" -e "@$2"
