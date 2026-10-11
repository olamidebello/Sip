#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root on the application server'; exit 1; }
repo_root=$(cd "$(dirname "$0")/../.." && pwd)
[[ -f /etc/olamide/kamailio-profiles.json && -f /etc/olamide/secrets.env ]] || {
  echo 'Install the private reviewed profile in /etc/olamide/kamailio-profiles.json first'; exit 1;
}
command -v ansible-playbook >/dev/null || { echo 'Install Debian ansible-core first'; exit 1; }
python3 - /etc/olamide/secrets.env <<'PY'
import pathlib,sys,urllib.parse
values=dict(line.split('=',1) for line in pathlib.Path(sys.argv[1]).read_text().splitlines() if line and not line.startswith('#') and '=' in line)
url=values.get('PUBLIC_ORIGIN','').strip('"\'')
parsed=urllib.parse.urlsplit(url)
assert parsed.scheme=='https' and parsed.hostname and not parsed.username and not parsed.query and not parsed.fragment and parsed.path in ('','/')
assert len(values.get('KAMAILIO_RUNNER_TOKEN',''))>=32
# Token stays in a root-only environment file; never interpolate secret values into a shell command.
pathlib.Path('/etc/olamide/local-controller.env').write_text('KAMAILIO_RUNNER_TOKEN='+values['KAMAILIO_RUNNER_TOKEN']+'\n')
pathlib.Path('/etc/olamide/local-controller-url').write_text(url.rstrip('/'))
PY
app_url=$(cat /etc/olamide/local-controller-url)
chmod 600 /etc/olamide/local-controller.env /etc/olamide/kamailio-profiles.json
cat >/etc/systemd/system/olamide-kamailio-local.service <<UNIT
[Unit]
Description=Olamide same-server Kamailio controller
After=network-online.target docker.service
Wants=network-online.target
[Service]
Type=oneshot
User=root
WorkingDirectory=$repo_root
EnvironmentFile=/etc/olamide/local-controller.env
ExecStart=/usr/bin/python3 $repo_root/tools/kamailio_controller.py --profiles /etc/olamide/kamailio-profiles.json --base $app_url
TimeoutStartSec=75000
UMask=0077
UNIT
cat >/etc/systemd/system/olamide-kamailio-local.timer <<'UNIT'
[Unit]
Description=Poll reviewed same-server SIP deployment plans
[Timer]
OnBootSec=2min
OnUnitInactiveSec=1min
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now olamide-kamailio-local.timer
echo 'Local controller timer enabled; deployment and evidence appear in Kamailio services.'
