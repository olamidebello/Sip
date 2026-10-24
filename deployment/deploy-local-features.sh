#!/usr/bin/env bash
# Preserve a modified live checkout; stage and validate a narrow feature integration.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 && $# == 1 ]] || { echo 'Root and controller checkout path required'; exit 2; }
source_dir=$(realpath "$1")
live=/opt/olamide/repo
install -d -m 0700 /opt/olamide/backups
backup=$(mktemp -d /opt/olamide/backups/local-features-XXXXXXXX)
stage=$backup/stage
exec 3>&1
exec >"$backup/deploy.log" 2>&1
phase=deployment_lock
report() {
 trap - ERR
 printf 'SIP_FEATURE_ERROR phase=%s backup=%s\n' "$phase" "$backup" >&3
 if [[ $phase == guarded_integration && -f "$backup/integration.txt" ]]; then
  python3 - "$backup/integration.txt" >&3 <<'PYSAFE'
import re,sys
for line in open(sys.argv[1]):
 line=line.strip()
 if re.fullmatch(r'(?:Unknown integration anchor in |Duplicate integration in |Missing or symlinked integration file: |Unfamiliar existing import in |Existing feature module differs: |Feature source missing: )[A-Za-z0-9_./-]+(?:; no files changed)?',line):
  print('SIP_FEATURE_DETAIL '+line)
 elif re.fullmatch(r'SIP_FEATURE_DETAIL file=[A-Za-z0-9_./-]+ check=[a-z_]+',line):
  print(line)
PYSAFE
 fi
 exit 1
}
trap report ERR
exec 9>/run/olamide-update.lock
flock -n 9 || report
phase=prerequisites
[[ "$source_dir" != "$live" && -f "$source_dir/tools/install-local-features.py" && -f "$live/deployment/docker/.env" ]]
for binary in docker python3 tar gzip curl; do command -v "$binary" >/dev/null; done
cd "$live/deployment/docker"
phase=compose_configuration
docker compose config --quiet
docker compose config --format json > "$backup/effective-compose.json"
phase=source_snapshot
mkdir -m 0700 "$stage"
tar -czf "$backup/source.tgz" -C "$live" --exclude=.git --exclude=node_modules --exclude=dist .
tar -xzf "$backup/source.tgz" -C "$stage"
git -C "$live" status --short > "$backup/git-status-before.txt"
git -C "$source_dir" rev-parse HEAD > "$backup/feature-release.txt"
phase=parser_runtime
mapfile -t parser_containers < <(docker compose ps -q api)
[[ ${#parser_containers[@]} -gt 0 ]]
parser_image=$(docker inspect --format '{{.Image}}' "${parser_containers[0]}")
phase=guarded_integration
python3 "$source_dir/tools/install-local-features.py" "$source_dir" "$stage" "$backup/manifest.json" --node-image "$parser_image" > "$backup/integration.txt" 2>&1
phase=staged_configuration
release_tool=$source_dir/tools/local-feature-release.py
python3 "$release_tool" prepare "$live" "$stage" "$backup"
phase=pin_running_images
python3 "$release_tool" pin "$live" "$stage" "$backup"
phase=database_backup
docker compose exec -T mysql sh -c 'exec mysqldump --single-transaction --no-tablespaces -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | gzip > "$backup/database.sql.gz"
gzip -t "$backup/database.sql.gz"
phase=save_original_files
python3 "$release_tool" save "$live" "$stage" "$backup"
runtime_changed=false
recover() {
 trap - ERR
 set +e
 python3 "$release_tool" restore "$live" "$stage" "$backup"
 python3 "$release_tool" tag-rollback "$live" "$stage" "$backup"
 if [[ $runtime_changed == true ]]; then
  docker compose -f "$backup/effective-compose.json" -f "$backup/rollback-images.json" up -d --no-build --no-deps --force-recreate api web
 fi
 report
}
trap recover ERR
phase=staged_api_build
docker compose -f "$backup/stage-compose.json" build api
phase=module_graph
if ! docker compose -f "$backup/stage-compose.json" run --rm --no-deps -T --entrypoint node api --experimental-vm-modules /app/featureModuleGraph.mjs /app/server.js > "$backup/module-graph.txt" 2>&1; then
 python3 - "$backup/module-graph.txt" >&3 <<'PYGRAPH'
import re,sys
for line in open(sys.argv[1]):
 line=line.strip()
 if re.fullmatch(r'SIP_FEATURE_DETAIL missing_module=/app/[A-Za-z0-9_./-]+',line):print(line)
PYGRAPH
 false
fi
phase=backend_tests
if ! docker compose -f "$backup/stage-compose.json" run --rm --no-deps -T --entrypoint node api --test --test-reporter=tap /app/quickSignup.test.js /app/adminGroup.test.js /app/trunkManagement.test.js /app/locationReportAddress.test.js > "$backup/backend-tests.tap" 2>&1; then
 python3 "$source_dir/tools/report-feature-tests.py" "$backup/backend-tests.tap" --source "$source_dir" >&3
 false
fi
phase=staged_web_build
check_image=olamide-feature-web-check:${backup##*/}
docker build --target build -f "$stage/deployment/docker/web.Dockerfile" -t "$check_image" "$stage"
phase=browser_tests
if ! docker run --rm --entrypoint node "$check_image" --test --test-reporter=tap /app/src/quickSignup.test.js /app/src/adminGroup.test.js /app/src/trunkAdmin.test.js /app/src/flowrouteSetup.test.js /app/src/locationReports.test.js > "$backup/browser-tests.tap" 2>&1; then
 python3 "$source_dir/tools/report-feature-tests.py" "$backup/browser-tests.tap" --source "$source_dir" >&3
 false
fi
phase=final_web_build
docker compose -f "$backup/stage-compose.json" build web
phase=additive_schema
docker compose -f "$backup/stage-compose.json" run --rm --no-deps -T --entrypoint node api --input-type=module <<'JS'
import {createDatabase} from './db.js';
import {migrateQuickSignup} from './quickSignup.js';
import {migrateAdminGroup} from './adminGroup.js';
const db=createDatabase(process.env.MYSQL_URL);
try {await migrateQuickSignup(db);await migrateAdminGroup(db);} finally {await db.end();}
JS
phase=promote_source
python3 "$release_tool" promote "$live" "$stage" "$backup"
phase=promote_images
python3 "$release_tool" tag-release "$live" "$stage" "$backup"
phase=restart_application
runtime_changed=true
docker compose up -d --no-build --no-deps --force-recreate api web
phase=internal_health
healthy=false
for attempt in {1..24}; do
 if docker compose exec -T api node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(j=>{if(j.status!=='ok')process.exit(1)}).catch(()=>process.exit(1))"; then healthy=true;break;fi
 sleep 3
done
[[ "$healthy" == true ]]
phase=public_health
curl -fsS --max-time 20 --retry 6 --retry-all-errors --retry-delay 3 https://sip.dobhrap.com/api/health | python3 -c 'import json,sys; assert json.load(sys.stdin)["status"]=="ok"'
curl -fsS --max-time 20 https://sip.dobhrap.com/ -o /dev/null
trap - ERR
printf 'SIP_FEATURE_DEPLOYED backup=%s\n' "$backup" >&3
