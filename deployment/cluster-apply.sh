#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Root required' >&2; exit 1; }
exec 8>/run/olamide-cluster.lock
flock -n 8 || exit 0
cd /opt/olamide/repo/deployment/docker
pending=$(docker compose exec -T api node cluster-command.js pending)
[[ -n "$pending" ]] || exit 0
read -r revision replicas <<<"$pending"
[[ "$revision" =~ ^[0-9]+$ && "$replicas" =~ ^[1-4]$ ]] || exit 1
if docker compose up -d --no-build --scale "api=$replicas" api; then
  docker compose exec -T api node cluster-command.js applied "$revision" "$replicas"
else
  docker compose exec -T api node cluster-command.js failed "$revision" "$replicas" || true
  exit 1
fi
