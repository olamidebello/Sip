#!/usr/bin/env bash
set -euo pipefail
repo=/opt/olamide/kamailio-staging
env_file=/opt/olamide/repo/deployment/docker/.env
[[ -f "$env_file" ]] || { echo "Production Compose environment missing" >&2; exit 1; }
[[ -z "$(docker ps -a --filter label=com.docker.compose.project=olamide-kamailio-pilot --format '{{.ID}}')" ]] || {
  echo "An isolated pilot already exists; inspect it instead of recreating it" >&2
  exit 1
}
if ss -H -ltn '( sport = :18080 )' | grep -q .; then
  echo "Port 18080 is already bound" >&2
  exit 1
fi
cd "$repo"
export KAMAILIO_ROUTE_TOKEN
KAMAILIO_ROUTE_TOKEN="$(openssl rand -hex 32)"
compose=(docker compose -p olamide-kamailio-pilot --env-file "$env_file"
  -f "$repo/deployment/docker/compose.yml"
  -f "$repo/deploy/kamailio/pilot.override.yml")
"${compose[@]}" config --format json | python3 -c '
import json,sys
from urllib.parse import urlparse
cfg=json.load(sys.stdin)
db=cfg["services"]["api"]["environment"]["MYSQL_URL"]
if urlparse(db).hostname != "mysql":
    raise SystemExit("Pilot refused: MYSQL_URL must target the isolated mysql service")
api=cfg["services"]["api"]
ports=api.get("ports",[])
if not any(p.get("host_ip")=="127.0.0.1" and int(p.get("published",0))==18080 for p in ports):
    raise SystemExit("Pilot refused: API must bind only to host loopback 18080")
'
"${compose[@]}" build api
"${compose[@]}" up -d --no-build api
ready=0
for attempt in {1..12}; do
  if curl --connect-timeout 2 --max-time 3 --fail --silent http://127.0.0.1:18080/api/health >/dev/null; then
    ready=1
    break
  fi
  sleep 5
done
if (( !ready )); then
  echo "Pilot API did not become healthy; inspect pilot logs without sharing secrets" >&2
  exit 1
fi
bash "$repo/deploy/kamailio/preflight.sh"
echo "Isolated API pilot ready. No production API or SIP service was changed."
