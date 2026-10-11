#!/usr/bin/env bash
# One noninteractive entry point. Credentials and maintenance approval are inputs.
set -euo pipefail
if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo 'Usage: deploy-production.sh INVENTORY PRIVATE_CONFIG.yml [40-character-release-sha|latest-validated]' >&2
  exit 2
fi
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
for command_name in ansible-playbook python3 flock; do
  command -v "$command_name" >/dev/null || { echo "Required controller tool: $command_name" >&2; exit 1; }
done
[[ -r "$1" && -r "$2" ]] || { echo 'Readable inventory and private configuration required' >&2; exit 1; }
# Never accept interactive SSH passwords/sudo prompts during unattended execution.
export ANSIBLE_HOST_KEY_CHECKING=True
export ANSIBLE_RETRY_FILES_ENABLED=False
export ANSIBLE_ROLES_PATH="$repo_root/deploy/ansible/roles${ANSIBLE_ROLES_PATH:+:$ANSIBLE_ROLES_PATH}"
exec 9>"${TMPDIR:-/tmp}/olamide-production-controller-$(id -u).lock"
flock -n 9 || { echo 'Another production deployment is running on this controller' >&2; exit 1; }
release=${3:-latest-validated}
if [[ "$release" == latest-validated ]]; then
  command -v curl >/dev/null && command -v jq >/dev/null || { echo 'curl and jq are required to select a CI-validated release' >&2; exit 1; }
  release=$(bash "$repo_root/deployment/verified-sha.sh")
fi
[[ "$release" =~ ^[0-9a-f]{40}$ ]] || { echo 'An immutable 40-character release SHA is required' >&2; exit 1; }
# A SHA argument deliberately selects that release; default selects the latest successful CI release.
ansible-playbook -i "$1" "$repo_root/deployment/ansible/production.yml" --syntax-check -e "@$2" -e "deployment_ref=$release"
exec ansible-playbook -i "$1" "$repo_root/deployment/ansible/production.yml" -e "@$2" -e "deployment_ref=$release"
