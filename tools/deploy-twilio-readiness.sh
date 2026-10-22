#!/bin/bash
set -euo pipefail
umask 077
cd /opt/olamide/repo
exec 9>/run/olamide-update.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
release=5d987ebd76586612e570f1da1fa39db911e47e49
git merge-base --is-ancestor "$release" origin/main
backup="/opt/olamide/backups/twilio-readiness-$(date -u +%Y%m%dT%H%M%S)-$$"
install -d -m 0700 "$backup"
files=(services/api/twilioHub.js apps/web/src/twilioHubUi.js services/api/twilioReadiness.js services/api/twilioReadiness.test.js apps/web/src/twilioReadinessUi.js apps/web/src/twilioReadinessUi.test.js)
for f in "${files[@]}"; do mkdir -p "$backup/source/$(dirname "$f")"; if test -f "$f"; then cp -p "$f" "$backup/source/$f"; fi; done
cd deployment/docker
suffix=$(date +%s)-$$
for svc in api web; do
 container=$(docker compose ps -q "$svc")
 test -n "$container"
 image=$(docker inspect --format '{{.Image}}' "$container")
 docker tag "$image" "olamide-$svc:before-twilio-readiness-$suffix"
done
printf 'services:\n  api:\n    image: olamide-api:before-twilio-readiness-%s\n  web:\n    image: olamide-web:before-twilio-readiness-%s\n' "$suffix" "$suffix" > "$backup/rollback.yml"
cd ../..
recover() {
 trap - ERR
 for f in "${files[@]}"; do if test -f "$backup/source/$f"; then cp -p "$backup/source/$f" "/opt/olamide/repo/$f"; else rm -f "/opt/olamide/repo/$f"; fi; done
 cd /opt/olamide/repo/deployment/docker
 docker compose -f compose.yml -f "$backup/rollback.yml" up -d --no-deps api web </dev/null || true
 echo "Readiness update failed; previous source/images restored where available. Backup: $backup"
 exit 1
}
trap recover ERR
for f in services/api/twilioReadiness.js services/api/twilioReadiness.test.js apps/web/src/twilioReadinessUi.js apps/web/src/twilioReadinessUi.test.js; do git show "$release:$f" > "$f"; done
git show "$release:tools/install-twilio-readiness.py" > "$backup/install.py"
python3 "$backup/install.py"
cd deployment/docker
docker compose build api </dev/null
docker compose run --rm --no-deps -T --entrypoint node api --test /app/twilioReadiness.test.js </dev/null
docker compose run --rm --no-deps -T --entrypoint node api --check /app/twilioHub.js </dev/null
cd ../..
docker build -f deployment/docker/web.Dockerfile --target build -t olamide-twilio-readiness-ui-check . </dev/null
docker run --rm --entrypoint node olamide-twilio-readiness-ui-check --test /app/src/twilioReadinessUi.test.js /app/src/twilioHubUi.test.js </dev/null
cd deployment/docker
docker compose build web </dev/null
docker compose up -d --no-deps api web </dev/null
curl -fsS --max-time 10 --retry 12 --retry-all-errors --retry-delay 3 https://sip.dobhrap.com/api/health
trap - ERR
echo "Super-admin readiness panel installed; no missing runtime feature activated. Backup: $backup"
