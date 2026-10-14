#!/usr/bin/env bash
# Deploy version-controlled, implemented components; never generate fictional add-on code.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root on the application server' >&2; exit 1; }
repo=/opt/olamide/repo
native=true
paid=false
for option in "$@"; do
  case "$option" in
    --without-native) native=false ;;
    --with-paid-calls) paid=true ;;
    *) echo 'Usage: deploy-astpp-application.sh [--without-native] [--with-paid-calls]' >&2; exit 2 ;;
  esac
done
cd "$repo"
git diff HEAD --exit-code >/dev/null
git pull --ff-only origin main
release=$(git rev-parse HEAD)
# Each sub-installer uses the standard deployment lock and exact-release CI gate.
run_stage() {
  [[ $(git rev-parse HEAD) == "$release" ]] || { echo 'Release changed during staged deployment; stopping' >&2; exit 1; }
  bash "$repo/deployment/$1"
}
run_stage deploy-advanced-astpp-navigation.sh
if "$native"; then run_stage deploy-astpp-features.sh; fi
if "$paid"; then run_stage deploy-kamailio-paid-calls.sh; fi
printf 'Implemented application stages deployed at %s. Review each recap and run live call/billing acceptance tests. Missing feature implementations and external approvals remain pending.\n' "$release"
