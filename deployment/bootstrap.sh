#!/usr/bin/env bash
set -euo pipefail
if (( EUID != 0 )); then echo 'Run with sudo or as root' >&2; exit 1; fi
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DOMAIN=${OLAMIDE_DOMAIN:-sip.dobhrap.com}
if [[ ! "$DOMAIN" =~ ^[a-z0-9.-]+$ ]]; then echo 'Invalid domain' >&2; exit 1; fi
bash "$SCRIPT_DIR/install-ansible.sh"
install -d -m 0700 /etc/olamide
if [[ ! -e /etc/olamide/secrets.env ]]; then
  app_password=$(openssl rand -hex 32)
  root_password=$(openssl rand -hex 32)
  umask 077
  cat > /etc/olamide/secrets.env <<ENV
DOMAIN=$DOMAIN
MYSQL_DATABASE=olamide
MYSQL_USER=olamide_app
MYSQL_PASSWORD=$app_password
MYSQL_ROOT_PASSWORD=$root_password
MYSQL_URL=mysql://olamide_app:$app_password@mysql:3306/olamide
MEETING_ICE_SERVERS_JSON=[]
ENV
  chmod 0600 /etc/olamide/secrets.env
fi
validated_ref=$(bash "$SCRIPT_DIR/verified-sha.sh")
OLAMIDE_DOMAIN="$DOMAIN" ansible-playbook -i 'localhost,' -c local \
  "$SCRIPT_DIR/ansible/site.yml" \
  -e "local_secrets_file=/etc/olamide/secrets.env" \
  -e "deployment_ref=$validated_ref"
if [[ "${OLAMIDE_SWITCH_STAGE:-0}" == 1 ]]; then
  token_file=/etc/olamide/signalwire-token
  [[ -s "$token_file" ]] || { echo "Switch staging requires a private SignalWire token in $token_file" >&2; exit 1; }
  [[ "$(stat -c %a "$token_file")" == 600 ]] || { echo "Set mode 0600 on $token_file" >&2; exit 1; }
  SIGNALWIRE_TOKEN=$(<"$token_file") ansible-playbook -i 'localhost,' -c local "$SCRIPT_DIR/ansible/switch.yml"
fi
echo "Installed validated commit $validated_ref. See /opt/olamide/repo/README.md."
