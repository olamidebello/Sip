#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
target=android/app/src/main/java/com/dobhrap/olamide
test -d android/app/src/main || { echo 'Run npx cap add android first' >&2; exit 1; }
mkdir -p "$target"
cp carrier-native/MainActivity.java carrier-native/CarrierBrandPlugin.java "$target/"
