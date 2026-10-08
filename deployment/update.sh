#!/usr/bin/env bash
set -euo pipefail
exec 9>/run/olamide-update.lock
flock -n 9 || exit 0
repo=/opt/olamide/repo
compose_dir=$repo/deployment/docker
backup_dir=/opt/olamide/backups
[[ -f "$compose_dir/.env" ]] || { echo 'Deployment secrets missing' >&2; exit 1; }
# Provision a private URL token on existing deployments before starting the new API.
if ! grep -q '^PAYMENT_CONFIG_KEY=' /etc/olamide/secrets.env; then
  umask 077
  printf 'PAYMENT_CONFIG_KEY=%s\n' "$(openssl rand -hex 32)" >> /etc/olamide/secrets.env
fi
env_changed=0
if ! grep -q '^PAYMENT_CONFIG_KEY=' "$compose_dir/.env"; then
  grep '^PAYMENT_CONFIG_KEY=' /etc/olamide/secrets.env >> "$compose_dir/.env"
  env_changed=1
fi
if ! grep -q '^FLOWROUTE_WEBHOOK_TOKEN=' /etc/olamide/secrets.env; then
  umask 077
  printf 'FLOWROUTE_WEBHOOK_TOKEN=%s\n' "$(openssl rand -hex 32)" >> /etc/olamide/secrets.env
fi
if ! grep -q '^FLOWROUTE_WEBHOOK_TOKEN=' "$compose_dir/.env"; then
  grep '^FLOWROUTE_WEBHOOK_TOKEN=' /etc/olamide/secrets.env >> "$compose_dir/.env"
fi
cd "$repo"
current=$(git rev-parse HEAD)
# Existing hosts acquire the local scaling timer after their first application update.
if [[ -f deployment/install-cluster-timer.sh ]]; then bash deployment/install-cluster-timer.sh; fi
candidate=$(bash deployment/verified-sha.sh)
if [[ "$candidate" == "$current" ]]; then
  if (( env_changed )); then (cd "$compose_dir" && docker compose up -d --no-build api); fi
  exit 0
fi
git diff --quiet && git diff --cached --quiet || { echo 'Tracked local changes; update paused' >&2; exit 1; }
git fetch --quiet origin main
git cat-file -e "$candidate^{commit}"
git merge-base --is-ancestor "$candidate" origin/main || { echo 'Validated commit not on main' >&2; exit 1; }
git merge-base --is-ancestor "$current" "$candidate" || { echo 'Non-forward update blocked' >&2; exit 1; }
install -d -m 0700 "$backup_dir"
umask 077
backup_file="$backup_dir/olamide-$(date -u +%Y%m%dT%H%M%SZ)-$current.sql.gz"
cd "$compose_dir"
docker compose exec -T mysql sh -c 'exec mysqldump --single-transaction -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | gzip > "$backup_file"
test -s "$backup_file"
api_health() {
  for attempt in {1..12}; do
    if docker compose exec -T api node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
      return 0
    fi
    sleep 5
  done
  return 1
}
cd "$repo"
git checkout --quiet --detach "$candidate"
cd "$compose_dir"
if docker compose build --pull api web && docker compose up -d --remove-orphans && api_health; then
  echo "Updated Olamide from $current to $candidate; backup: $backup_file"
else
  echo "Update failed; restoring application commit $current (database backup preserved: $backup_file)" >&2
  git -C "$repo" checkout --quiet --detach "$current"
  docker compose build api web
  docker compose up -d --remove-orphans
  exit 1
fi
