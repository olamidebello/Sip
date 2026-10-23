#!/bin/bash
# Pinned orchestrator for an existing Olamide deployment. No paid submissions.
set -euo pipefail
umask 077
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
work=${1:?Private reviewed source directory required}
force=${2:-false}
[[ "$force" == true || "$force" == false ]] || exit 1
exec 8>/run/olamide-platform-workflow.lock
flock -n 8 || { echo 'Another platform workflow is running'; exit 1; }
cd /opt/olamide/repo
for f in deployment/docker/compose.yml services/api/locationPolicy.js services/api/smoothDid.js services/api/providerManager.js; do
 test -f "$f" || { echo "Existing platform prerequisite missing: $f"; exit 1; }
done
docker compose version >/dev/null
cd deployment/docker
docker compose config --quiet
for svc in mysql api web; do
 cid=$(docker compose ps -q "$svc")
 test -n "$cid" || { echo "Existing running service required: $svc"; exit 1; }
done
cd ../..
reports=/opt/olamide/reports/platform-install
install -d -m 0700 "$reports"
bash "$work/backup-platform.sh"
earlier_changed=false
for stage in twilio-platform-local did-availability-local single-auth-local; do
 digest=$(sha256sum "$work/$stage.yml" | cut -d' ' -f1)
 receipt="$reports/$stage.sha256"
 if [[ "$force" == false && "$earlier_changed" == false && -f "$receipt" && "$(cat "$receipt")" == "$digest" ]]; then
  echo "Previously completed pinned stage: $stage (use olamide_force_rebuild=true to rebuild)"
  continue
 fi
 log="$reports/$stage-$(date -u +%Y%m%dT%H%M%S)-$$.log"
 if ! ansible-playbook -i localhost, -c local "$work/$stage.yml" -e '{"twilio_provision_resources":false,"twilio_require_all_live":false}' > "$log" 2>&1; then
  echo "Stage failed: $stage. Inspect root-only log: $log"
  echo 'Later stages stopped. This is not an all-or-nothing database rollback.'
  exit 1
 fi
 printf '%s\n' "$digest" > "$receipt"
 earlier_changed=true
 echo "Completed: $stage. Log: $log"
done
# The final auth stage is deliberately last: older pinned prerequisite installers
# may otherwise restore an earlier public header.
exec 9>/run/olamide-update.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
cd deployment/docker
docker compose exec -T api node --input-type=module -e 'import {createDatabase} from "./db.js";import {auditAuthSchema} from "./authSchema.js";const db=createDatabase(process.env.MYSQL_URL);try{const r=await auditAuthSchema(db);console.log(JSON.stringify(r));}finally{await db.end();}' > "$reports/auth-schema.json"
docker compose run --rm --no-deps -T --user 0:0 --volume "$work:/review:ro" --entrypoint node api /review/platform-install-report.mjs > "$reports/requirements.json.tmp"
python3 - "$reports/requirements.json.tmp" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
if any(not row['present'] for row in r['schema']['requiredTables']):raise SystemExit('Required application tables are missing; inspect requirements report')
if not all(r['modules'].values()):raise SystemExit('Required integration source is absent; inspect requirements report')
PY
mv "$reports/requirements.json.tmp" "$reports/requirements.json"
curl -fsS --max-time 10 --retry 12 --retry-all-errors --retry-delay 3 https://sip.dobhrap.com/api/health
echo
echo "Supported code installed. Per-feature evidence: $reports/requirements.json"
echo 'External credentials can be configured later in the super-admin GUI. No paid remote resources were provisioned.'
echo 'PBX/media engines, missing provider runtime adapters and other incomplete catalog features remain implementation work; live service is not commissioned.'
