#!/usr/bin/env bash
# Update an existing installation without replacing secrets or local integrations.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root'; exit 1; }
repo=/opt/olamide/repo
exec 9>/run/olamide-update.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
cd "$repo"
[[ $(git remote get-url origin) == https://github.com/olamidebello/Sip.git ]] || { echo 'Unexpected repository origin'; exit 1; }
[[ -f deployment/docker/.env ]] || { echo 'Existing Docker environment required; use deployment/install-all.sh for a new server'; exit 1; }
[[ -z $(git status --porcelain --untracked-files=normal) ]] || { echo 'Local changes detected; reconcile server integrations before deployment. No files overwritten.'; exit 1; }
git fetch origin main
previous=$(git rev-parse HEAD)
release=$(git rev-parse origin/main)
git merge-base --is-ancestor "$previous" "$release" || { echo 'Diverged server checkout; reconcile before deployment'; exit 1; }
install -d -m 0700 /opt/olamide/backups
backup=$(mktemp -d /opt/olamide/backups/pull-deploy-XXXXXXXX)
cd deployment/docker
docker compose config --quiet
docker compose config > "$backup/effective-compose.yml"
# Snapshot the source and private Compose configuration together, including ignored files.
tar -czf "$backup/source.tgz" -C "$repo" --exclude=.git --exclude=node_modules .
for service in api web; do
  cid=$(docker compose ps -q "$service")
  [[ -n $cid ]] || { echo "Running $service required"; exit 1; }
  image=$(docker inspect --format '{{.Image}}' "$cid")
  docker tag "$image" "olamide-$service:rollback-${backup##*/}"
done
printf 'services:\n  api:\n    image: olamide-api:rollback-%s\n  web:\n    image: olamide-web:rollback-%s\n' "${backup##*/}" "${backup##*/}" > "$backup/rollback.yml"
docker compose exec -T mysql sh -c 'exec mysqldump --single-transaction --no-tablespaces -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | gzip > "$backup/database.sql.gz"
gzip -t "$backup/database.sql.gz"
printf '%s\n' "$previous" > "$backup/previous-commit"
printf '%s\n' "$release" > "$backup/release-commit"
runtime_changed=false
rollback() {
  trap - ERR
  set +e
  git -C "$repo" checkout --detach "$previous"
  if [[ $runtime_changed == true ]]; then
    cd "$repo/deployment/docker"
    docker compose -f "$backup/effective-compose.yml" -f "$backup/rollback.yml" up -d --no-build --no-deps api web
  fi
  echo "Deployment failed. Previous application restore attempted; database migrations retained. Private backup: $backup" >&2
  exit 1
}
trap rollback ERR
git -C "$repo" checkout --detach "$release"
cd "$repo/deployment/docker"
docker compose config --quiet
docker compose build api web
runtime_changed=true
docker compose up -d --no-build --no-deps api web
healthy=false
for attempt in {1..24}; do
  if docker compose exec -T api node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(j=>{if(j.status!=='ok')process.exit(1)}).catch(()=>process.exit(1))"; then healthy=true; break; fi
  sleep 3
done
[[ $healthy == true ]]
curl --fail --silent --show-error --max-time 20 --retry 3 --retry-all-errors https://sip.dobhrap.com/api/health | python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "ok"'
curl --fail --silent --show-error --max-time 20 https://sip.dobhrap.com/ -o /dev/null
trap - ERR
echo "SIP_DEPLOYED release=$release backup=$backup"
