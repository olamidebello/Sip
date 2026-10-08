#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || exit 1
cat > /etc/systemd/system/olamide-cluster.service <<'UNIT'
[Unit]
Description=Apply requested Olamide API replica count
After=docker.service olamide-compose.service
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/olamide/repo/deployment/cluster-apply.sh
UNIT
cat > /etc/systemd/system/olamide-cluster.timer <<'UNIT'
[Unit]
Description=Check Olamide API scaling requests
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now olamide-cluster.timer
