#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root on the application host'; exit 1; }
repo=/opt/olamide/repo
[[ $(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd) == "$repo" ]] || exit 1
bootstrap=false
case "${1:-}" in '') ;; --enable-gui-runner) bootstrap=true ;; *) echo 'Usage: install-operator-requirements.sh [--enable-gui-runner]'; exit 2 ;; esac
exec 9>/run/olamide-operator-requirements.lock
flock -n 9 || { echo 'Operator prerequisite installation already running'; exit 1; }
cd "$repo"
git diff HEAD --exit-code >/dev/null
release=$(git rev-parse HEAD)
# Validate the exact checked out release, never bypass the application CI gate.
python3 - "$release" <<'PY'
import json,sys,urllib.request
sha=sys.argv[1]
url='https://api.github.com/repos/olamidebello/Sip/actions/workflows/deploy.yml/runs?branch=main&event=push&status=success&per_page=100&head_sha='+sha
req=urllib.request.Request(url,headers={'User-Agent':'Olamide-Operator-Installer','Cache-Control':'no-cache'})
with urllib.request.urlopen(req,timeout=30) as response:
    runs=json.load(response)['workflow_runs']
assert any(r['head_sha']==sha and r['conclusion']=='success' for r in runs), 'Exact release has not passed deployment CI'
PY
command -v ansible-playbook >/dev/null || { apt-get update; apt-get install -y ansible-core; }
ansible-playbook -i "$repo/deploy/ansible/user-login.local.yml" "$repo/deploy/ansible/operator-requirements.yml" -e "operator_enable_gui_runner=$bootstrap"
