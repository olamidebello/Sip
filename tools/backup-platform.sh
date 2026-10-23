#!/bin/bash
# Application-database snapshot; deliberately does not restore or delete data.
set -euo pipefail
umask 077
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
cd /opt/olamide/repo/deployment/docker
exec 9>/run/olamide-update.lock
flock -n 9 || { echo 'Deployment or backup already running'; exit 1; }
root=/opt/olamide/backups/platform
install -d -m 0700 "$root"
# Pause instead of silently deleting the only recoverable backups.
count=$(find "$root" -mindepth 1 -maxdepth 1 -type d -name 'snapshot-*' | wc -l)
if (( count >= 50 )); then echo 'Backup limit reached (50); export and review retained snapshots'; exit 1; fi
available=$(df --output=avail -B1 "$root" | tail -1)
if (( available < 2147483648 )); then echo 'At least 2 GiB free space required for snapshot'; exit 1; fi
nontransactional=$(docker compose exec -T mysql sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root -N -B "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type=0x42415345205441424c45 AND engine<>0x496e6e6f4442"')
[[ "$nontransactional" == 0 ]] || { echo 'Nontransactional application tables require a maintenance-window backup'; exit 1; }
stage=$(mktemp -d "$root/.snapshot-XXXXXX")
trap 'rm -rf -- "$stage"' EXIT
docker compose exec -T mysql sh -ec 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -u root --single-transaction --quick --routines --events --triggers --hex-blob --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' | gzip -c > "$stage/database.sql.gz"
gzip -t "$stage/database.sql.gz"
# Keep deployment configuration and installed source together; encrypted provider
# values still require the retained encryption keys to be usable after recovery.
tar -czf "$stage/source-and-config.tar.gz" --exclude='./.git' --exclude='./node_modules' --exclude='*/node_modules' --exclude='*/dist' -C /opt/olamide/repo .
tar -tzf "$stage/source-and-config.tar.gz" > /dev/null
(cd "$stage"; sha256sum database.sql.gz source-and-config.tar.gz > SHA256SUMS)
printf '%s\n' 'Application database and repository snapshot. Not a whole-host backup. Restore has not been acceptance-tested. Keep private: source archive may contain deployment secrets.' > "$stage/README.txt"
dest="$root/snapshot-$(date -u +%Y%m%dT%H%M%S)-$$"
mv "$stage" "$dest"
trap - EXIT
echo "Private snapshot saved: $dest"
