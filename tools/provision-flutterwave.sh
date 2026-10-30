#!/usr/bin/env bash
set -euo pipefail
umask 077
repo_dir="${1:-/opt/olamide/repo}"
output_dir=/opt/olamide/private/flutterwave
install -d -m 0700 "$output_dir"
exec 9>"$output_dir/provision.lock"
flock -n 9 || { echo 'Provisioning is already running'; exit 1; }
temporary_file=$(mktemp "$output_dir/.settings.XXXXXX")
trap 'rm -f "$temporary_file"' EXIT
cd "$repo_dir/deployment/docker"
if test -f /etc/olamide/secrets.env; then
  compose_env=/etc/olamide/secrets.env
else
  compose_env="$repo_dir/deployment/docker/.env"
fi
test -f "$compose_env" || { echo 'Compose environment file is missing'; exit 1; }
docker compose --env-file "$compose_env" exec -T -w /app api node --input-type=module < "$repo_dir/tools/provision-flutterwave.mjs" > "$temporary_file"
chmod 0600 "$temporary_file"
mv "$temporary_file" "$output_dir/dashboard-settings.json"
echo 'Provisioned test settings. Private dashboard values: /opt/olamide/private/flutterwave/dashboard-settings.json'
echo 'Deploy the webhook code before saving its URL in Flutterwave.'

