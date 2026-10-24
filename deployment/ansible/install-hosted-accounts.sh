#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/olamide/repo/deployment/docker
exec 9>/run/olamide-update.lock
flock -n 9 || { echo 'Another SIP deployment is running'; exit 1; }
test -f .env
backup_dir="/opt/olamide/backups/hosted-$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 0700 "$backup_dir"
cp -p .env "$backup_dir/compose.env"
cp -p /etc/olamide/secrets.env "$backup_dir/secrets.env"
python3 ../ansible/configure-hosted-token.py
docker compose config --quiet
old_image=$(docker inspect --format '{{.Image}}' "$(docker compose ps -q api)")
tag="olamide-api:before-hosted-$(date +%s)-$$"
docker tag "$old_image" "$tag"
old_web=$(docker inspect --format '{{.Image}}' "$(docker compose ps -q web)")
web_tag="olamide-web:before-hosted-$(date +%s)-$$"
docker tag "$old_web" "$web_tag"
printf 'services:\n  api:\n    image: %s\n  web:\n    image: %s\n' "$tag" "$web_tag" > "$backup_dir/rollback.yml"
recover() {
 trap - ERR
 docker compose -f compose.yml -f "$backup_dir/rollback.yml" up -d --no-deps --no-build api web || true
 echo "Bridge installation failed. Previous API image restored where possible. Additive schema retained. Private backup: $backup_dir"
 exit 1
}
trap recover ERR
docker compose exec -T mysql sh -c 'exec mysqldump --single-transaction -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | gzip > "$backup_dir/database.sql.gz"
test -s "$backup_dir/database.sql.gz"
docker compose build api web
docker compose run --rm --no-deps -T --entrypoint node api --test hostedAccounts.test.js pbxBranding.test.js
docker compose run --rm --no-deps -T migrate
docker compose up -d --no-deps --no-build api web
curl -fsS --max-time 10 --retry 10 --retry-all-errors --retry-delay 2 https://sip.dobhrap.com/api/health >/dev/null
# The endpoint must reject an unauthenticated request before it is considered installed.
status=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' https://sip.dobhrap.com/api/integrations/hosted-account)
test "$status" = 401
trap - ERR
echo "Hosted-account bridge installed; private token /root/dobhrap-sip-bridge-token. Backup: $backup_dir"
