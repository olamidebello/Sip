#!/usr/bin/env bash
# Run ONLY on a trusted administrator computer with gh, keytool, openssl and base64 installed.
set -euo pipefail
umask 077
REPO="olamidebello/Sip"
PACKAGE="com.africanappsstore.olamide"
for cmd in gh keytool openssl base64; do command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }; done
gh auth status >/dev/null
gh repo view "$REPO" >/dev/null
existing="$(gh secret list --repo "$REPO" --json name --jq '.[].name')"
for name in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  if grep -Fxq "$name" <<< "$existing"; then
    echo "Refusing to replace existing signing secret $name. Preserve existing upload identity." >&2
    exit 1
  fi
done
BACKUP_DIR="${OLAMIDE_SIGNING_BACKUP_DIR:-$HOME/olamide-play-upload-key-backup}"
if [[ -e "$BACKUP_DIR" ]]; then
  echo "Refusing to overwrite existing backup directory: $BACKUP_DIR" >&2
  exit 1
fi
mkdir -m 700 -p "$BACKUP_DIR"
KEYSTORE="$BACKUP_DIR/olamide-upload.jks"
ALIAS="olamide-upload"
STORE_PASS="$(openssl rand -hex 24)"
KEY_PASS="$(openssl rand -hex 24)"
keytool -genkeypair -v -keystore "$KEYSTORE" -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12 \
  -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
  -dname "CN=Olamide, OU=Android, O=Olamide Olatayo Bello Corporation, C=US" >/dev/null
# PKCS12 implementations often require key and store passwords to match.
KEY_PASS="$STORE_PASS"
printf '%s' "$STORE_PASS" | gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO"
printf '%s' "$KEY_PASS" | gh secret set ANDROID_KEY_PASSWORD --repo "$REPO"
printf '%s' "$ALIAS" | gh secret set ANDROID_KEY_ALIAS --repo "$REPO"
base64 < "$KEYSTORE" | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPO"
printf 'Package: %s\nAlias: %s\nKeystore password: %s\nKey password: %s\n' \
 "$PACKAGE" "$ALIAS" "$STORE_PASS" "$KEY_PASS" > "$BACKUP_DIR/credentials.txt"
chmod 600 "$BACKUP_DIR/credentials.txt" "$KEYSTORE"
keytool -list -v -keystore "$KEYSTORE" -storepass "$STORE_PASS" > "$BACKUP_DIR/upload-certificate.txt"
echo "Signing secrets configured. Securely back up $BACKUP_DIR OFF this computer."
echo "Never commit or email the keystore or credentials. GitHub Actions can now build signed AABs."
