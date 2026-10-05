#!/usr/bin/env bash
set -euo pipefail
if (( EUID != 0 )); then echo 'Run as root on the Debian server' >&2; exit 1; fi
if [[ ! -r /etc/os-release ]]; then echo 'Cannot determine operating system' >&2; exit 1; fi
. /etc/os-release
if [[ "$ID" != debian || "$VERSION_ID" != 12 ]]; then echo 'Debian 12 is required' >&2; exit 1; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ansible ca-certificates curl git jq openssl python3
ansible-playbook --version | head -1
