#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# -eq 1 && -f "$1" ]] || { echo 'Usage: install-runner.sh VAULT_PASSWORD_FILE' >&2; exit 2; }
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
controller_user="$(id -un)"
[[ "$controller_user" != root ]] || { echo 'Run as the controller SSH user with sudo access, not root.' >&2; exit 2; }
controller_home="$(getent passwd "$controller_user" | cut -d: -f6)"
private_dir="$controller_home/.config/olamide-runner"
install -d -m 700 "$private_dir"
install -m 600 "$1" "$private_dir/vault-password"
unit=/etc/systemd/system/olamide-fleet-runner.service
timer=/etc/systemd/system/olamide-fleet-runner.timer
sudo tee "$unit" >/dev/null <<UNIT
[Unit]
Description=Olamide private switch fleet worker
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=$controller_user
WorkingDirectory=$repo_root
ExecStart=/usr/bin/python3 $repo_root/deploy/ansible/runner.py --vault-password-file $private_dir/vault-password
TimeoutStartSec=3700
UNIT
sudo tee "$timer" >/dev/null <<'UNIT'
[Unit]
Description=Poll Olamide switch fleet jobs
[Timer]
OnBootSec=2min
OnUnitInactiveSec=1min
Persistent=true
[Install]
WantedBy=timers.target
UNIT
sudo chmod 644 "$unit" "$timer"
sudo systemctl daemon-reload
sudo systemctl enable --now olamide-fleet-runner.timer
printf 'Private fleet timer enabled for %s. Keep this controller online; journalctl -u olamide-fleet-runner shows worker status.\n' "$controller_user"
