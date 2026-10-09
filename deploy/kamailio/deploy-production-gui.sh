#!/usr/bin/env bash
# Upgrade the existing production Compose project from the reviewed staging
# checkout. Does not start Kamailio, RTPengine, or enable carrier routing.
set -euo pipefail
staging=/opt/olamide/kamailio-staging
production=/opt/olamide/repo
env_file=$production/deployment/docker/.env
backup_dir=/opt/olamide/backups
project=docker

[[ $(id -u) == 0 ]] || { echo 'Run as root on the production host' >&2; exit 2; }
[[ -f $env_file && -f $staging/deployment/docker/compose.yml ]] || {
  echo 'Production Compose environment or staged Compose file missing' >&2; exit 2;
}
[[ -f $production/deployment/docker/compose.yml ]] || {
  echo 'Production checkout is missing' >&2; exit 2;
}
[[ $(git -C "$staging" rev-parse --abbrev-ref HEAD) == HEAD ]] || {
  echo 'Use the reviewed detached staging checkout' >&2; exit 2;
}
[[ -z $(git -C "$staging" status --porcelain --untracked-files=no) ]] || {
  echo 'Tracked changes in staging checkout; deployment stopped' >&2; exit 2;
}
image=$(docker inspect -f '{{.Config.Image}}' docker-api-1 2>/dev/null || true)
[[ $image == olamide-api:local ]] || {
  echo 'Expected the existing docker-api-1 production project' >&2; exit 2;
}
compose() { docker compose --project-name "$project" --env-file "$env_file" -f "$staging/deployment/docker/compose.yml" "$@"; }
old_compose() { docker compose --project-name "$project" --env-file "$env_file" -f "$production/deployment/docker/compose.yml" "$@"; }
compose config --quiet
install -d -m 0700 "$backup_dir"
umask 077
backup_file="$backup_dir/olamide-before-gui-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
old_compose exec -T mysql sh -c 'exec mysqldump --single-transaction -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | gzip > "$backup_file"
test -s "$backup_file"
echo "Database backup: $backup_file"

# The pilot holds the same loopback bridge and has a separate disposable DB.
if docker ps -q --filter label=com.docker.compose.project=olamide-kamailio-pilot --filter label=com.docker.compose.service=api | grep -q .; then
  echo 'Stop the isolated pilot API before deploying the production loopback bridge' >&2
  exit 2
fi

if compose build api web && compose up -d mysql migrate api web; then
  for attempt in {1..30}; do
    if curl --connect-timeout 2 --max-time 4 --fail --silent http://127.0.0.1:18080/api/health >/dev/null; then
      echo "Production GUI and API deployed from $(git -C "$staging" rev-parse --short HEAD)"
      echo 'Carrier routing remains disabled until separately commissioned.'
      exit 0
    fi
    sleep 2
  done
fi
echo 'Health check failed; attempting application rollback (database backup retained)' >&2
old_compose build api web
old_compose up -d mysql migrate api web
exit 1
