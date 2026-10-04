#!/usr/bin/env bash
set -euo pipefail
# Only deploy commits whose push validation workflow has completed successfully.
response=$(curl --fail --silent --show-error --retry 3 \
  -H 'Accept: application/vnd.github+json' \
  -H 'User-Agent: Olamide-verified-deployer' \
  'https://api.github.com/repos/olamidebello/Sip/actions/workflows/deploy.yml/runs?branch=main&status=success&per_page=10')
sha=$(jq -r '[.workflow_runs[] | select(.event == "push" and .conclusion == "success")][0].head_sha // empty' <<<"$response")
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'No validated main-branch deployment commit available' >&2
  exit 1
fi
printf '%s\n' "$sha"
