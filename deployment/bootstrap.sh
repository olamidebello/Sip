#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_inventory="$repo_root/deployment/ansible/inventory.ini"
switch_inventory="$repo_root/deploy/ansible/inventory.yml"
secret_file="$repo_root/deployment/secrets.env"
vault_file="$repo_root/deploy/ansible/group_vars/switch_nodes/vault.yml"
temp_root=/dev/shm
[[ -d "$temp_root" && -w "$temp_root" ]] || temp_root=/tmp
vault_password_file="$(mktemp "$temp_root/olamide-vault-pass.XXXXXX")"
temporary_vault=''
cleanup() {
  rm -f "$vault_password_file"
  [[ -z "$temporary_vault" ]] || rm -f "$temporary_vault"
}
trap cleanup EXIT

if [[ ! -f /etc/os-release ]]; then echo "Linux or WSL is required." >&2; exit 1; fi
. /etc/os-release
if [[ "$ID" != debian && "$ID" != ubuntu ]]; then echo "Use a Debian or Ubuntu Ansible controller." >&2; exit 1; fi
if ! command -v ansible-playbook >/dev/null || ! command -v ssh >/dev/null; then
  if [[ $EUID -eq 0 ]]; then apt-get update && apt-get install -y ansible openssh-client python3 git curl
  else sudo apt-get update && sudo apt-get install -y ansible openssh-client python3 git curl
  fi
fi

prompt() {
  local variable="$1" label="$2" fallback="${3:-}" value="${!1:-}"
  if [[ -z "$value" ]]; then
    read -r -p "$label${fallback:+ [$fallback]}: " value
    value="${value:-$fallback}"
  fi
  [[ -n "$value" ]] || { echo "$label is required." >&2; exit 1; }
  printf -v "$variable" '%s' "$value"
}
prompt DOMAIN 'Application and SIP DNS name' 'sip.dobhrap.com'
prompt PUBLIC_IP 'Public IPv4 address'
prompt APP_HOST 'SSH hostname or address' "$PUBLIC_IP"
prompt SSH_USER 'SSH user with passwordless sudo' 'deploy'
prompt SSH_PORT 'SSH port' '22'
export DOMAIN PUBLIC_IP APP_HOST SSH_USER SSH_PORT

python3 - <<'PY'
import ipaddress,os,re
ipaddress.IPv4Address(os.environ['PUBLIC_IP'])
for name,pattern in {
 'DOMAIN':r'[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+',
 'APP_HOST':r'[a-zA-Z0-9.:-]+',
 'SSH_USER':r'[a-z_][a-z0-9_-]*',
 'SSH_PORT':r'[0-9]{1,5}'
}.items():
 if not re.fullmatch(pattern,os.environ[name]): raise SystemExit(f'Invalid {name}')
if not 1<=int(os.environ['SSH_PORT'])<=65535: raise SystemExit('Invalid SSH_PORT')
PY

if [[ ! -f "$secret_file" ]]; then
  export OLAMIDE_SECRET_FILE="$secret_file" OLAMIDE_SECRET_TEMPLATE="$repo_root/deployment/secrets.env.example"
  python3 - <<'PY'
import os,re,secrets,pathlib
template=pathlib.Path(os.environ['OLAMIDE_SECRET_TEMPLATE']).read_text()
db=secrets.token_urlsafe(36)
values={
 'DOMAIN':os.environ['DOMAIN'],'MYSQL_DATABASE':'olamide','MYSQL_USER':'olamide_app',
 'MYSQL_PASSWORD':db,'MYSQL_ROOT_PASSWORD':secrets.token_urlsafe(48),
 'MYSQL_URL':f'mysql://olamide_app:{db}@mysql:3306/olamide',
 'SIP_CREDENTIAL_KEY':secrets.token_hex(32),
 'FREESWITCH_XML_PASSWORD':secrets.token_urlsafe(48),
 'OTP_HMAC_SECRET':secrets.token_urlsafe(48),
 'PAYMENT_CONFIG_KEY':secrets.token_hex(32),
 'FLOWROUTE_WEBHOOK_TOKEN':secrets.token_hex(32),
 'DEPLOY_RUNNER_TOKEN':secrets.token_urlsafe(48)}
for key,value in values.items():
 template=re.sub(rf'(?m)^{re.escape(key)}=.*$',lambda _:f'{key}={value}',template,count=1)
path=pathlib.Path(os.environ['OLAMIDE_SECRET_FILE'])
path.write_text(template)
path.chmod(0o600)
PY
  echo "Generated private application and switch keys in deployment/secrets.env."
else
  echo "Using existing deployment/secrets.env; no database or credential values were overwritten."
fi

# Existing installations receive a private runner token without changing credentials.
export OLAMIDE_SECRET_FILE="$secret_file"
python3 - <<'PYTOKEN'
import os,pathlib,secrets
path=pathlib.Path(os.environ['OLAMIDE_SECRET_FILE'])
content=path.read_text()
if not any(line.startswith('DEPLOY_RUNNER_TOKEN=') and len(line.split('=',1)[1])>=32 for line in content.splitlines()):
 content='\n'.join(line for line in content.splitlines() if not line.startswith('DEPLOY_RUNNER_TOKEN='))+'\nDEPLOY_RUNNER_TOKEN='+secrets.token_urlsafe(48)+'\n'
 path.write_text(content)
 path.chmod(0o600)
PYTOKEN

xml_password="$(python3 - "$secret_file" <<'PY'
import pathlib,sys
data=dict(line.split('=',1) for line in pathlib.Path(sys.argv[1]).read_text().splitlines() if line and not line.startswith('#') and '=' in line)
print(data.get('FREESWITCH_XML_PASSWORD',''))
PY
)"
[[ ${#xml_password} -ge 32 ]] || { echo "FREESWITCH_XML_PASSWORD must contain at least 32 characters in deployment/secrets.env." >&2; exit 1; }
if [[ ! -f "$vault_file" ]]; then
  read -r -s -p 'SignalWire package token: ' signalwire_token
  echo
  [[ -n "$signalwire_token" ]] || { echo "SignalWire token is required." >&2; exit 1; }
  esl_password="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
  mkdir -p "$(dirname "$vault_file")"
  temporary_vault="$(mktemp "$temp_root/olamide-vault-data.XXXXXX")"
  export OLAMIDE_TOKEN="$signalwire_token" OLAMIDE_XML_PASSWORD="$xml_password" OLAMIDE_ESL_PASSWORD="$esl_password" OLAMIDE_TEMP_VAULT="$temporary_vault"
  python3 - <<'PY'
import json,os,pathlib
data={k:os.environ[v] for k,v in {
 'vault_signalwire_token':'OLAMIDE_TOKEN',
 'vault_freeswitch_xml_password':'OLAMIDE_XML_PASSWORD',
 'vault_freeswitch_esl_password':'OLAMIDE_ESL_PASSWORD'}.items()}
pathlib.Path(os.environ['OLAMIDE_TEMP_VAULT']).write_text(json.dumps(data)+'\n')
PY
  unset signalwire_token esl_password OLAMIDE_TOKEN OLAMIDE_XML_PASSWORD OLAMIDE_ESL_PASSWORD
fi

read -r -s -p 'Ansible Vault password: ' vault_password
echo
[[ ${#vault_password} -ge 12 ]] || { echo "Use a Vault password of at least 12 characters." >&2; exit 1; }
printf '%s\n' "$vault_password" > "$vault_password_file"
unset vault_password
if [[ -n "$temporary_vault" ]]; then
  ansible-vault encrypt "$temporary_vault" --output "$vault_file" --vault-password-file "$vault_password_file"
  rm -f "$temporary_vault"
  temporary_vault=''
fi

export OLAMIDE_SECRET_FILE="$secret_file" OLAMIDE_EXPECTED_DOMAIN="$DOMAIN"
python3 - <<'PY'
import os,pathlib,re
data=dict(line.split('=',1) for line in pathlib.Path(os.environ['OLAMIDE_SECRET_FILE']).read_text().splitlines()
          if line and not line.startswith('#') and '=' in line)
if data.get('DOMAIN')!=os.environ['OLAMIDE_EXPECTED_DOMAIN']:
 raise SystemExit('Existing secrets.env DOMAIN differs from the selected domain.')
if not re.fullmatch(r'[0-9a-fA-F]{64}',data.get('SIP_CREDENTIAL_KEY','')):
 raise SystemExit('SIP_CREDENTIAL_KEY must be 64 hexadecimal characters.')
for key in ['MYSQL_URL','MYSQL_PASSWORD','MYSQL_ROOT_PASSWORD']:
 if not data.get(key) or data[key].startswith('REPLACE_'): raise SystemExit(f'{key} is incomplete.')
PY
export OLAMIDE_XML_CHECK="$xml_password"
ansible-vault view "$vault_file" --vault-password-file "$vault_password_file" | python3 -c '
import json,os,sys
data=json.load(sys.stdin)
if data.get("vault_freeswitch_xml_password")!=os.environ["OLAMIDE_XML_CHECK"]:
 raise SystemExit("Vault XML password differs from deployment/secrets.env.")
if len(data.get("vault_signalwire_token",""))<1 or len(data.get("vault_freeswitch_esl_password",""))<32:
 raise SystemExit("Vault token or ESL password is incomplete.")
'
unset OLAMIDE_XML_CHECK

if [[ ! -f "$app_inventory" ]]; then
  printf 'app ansible_host=%s ansible_user=%s ansible_port=%s\n' "$APP_HOST" "$SSH_USER" "$SSH_PORT" > "$app_inventory"
fi
if [[ ! -f "$switch_inventory" ]]; then
  export OLAMIDE_SWITCH_INVENTORY="$switch_inventory"
  python3 - <<'PY'
import json,os,pathlib
env=os.environ
data={'all':{'children':{'switch_nodes':{'hosts':{'sip-switch-1':{
 'ansible_host':env['APP_HOST'],'ansible_user':env['SSH_USER'],'ansible_port':int(env['SSH_PORT'])}},
 'vars':{
 'freeswitch_domain':env['DOMAIN'],
 'freeswitch_xml_url':'https://'+env['DOMAIN']+'/api/switch/xml',
 'freeswitch_public_ip':env['PUBLIC_IP'],
 'freeswitch_signalwire_token':'{{ vault_signalwire_token }}',
 'freeswitch_xml_password':'{{ vault_freeswitch_xml_password }}',
 'freeswitch_esl_password':'{{ vault_freeswitch_esl_password }}',
 'freeswitch_wss_certificate_source':'caddy',
 'freeswitch_gateways':[],
 'freeswitch_minimum_version':'1.11.3',
 'freeswitch_upgrade':True,
 'manage_firewall':False,
 'coturn_enabled':False}}}}}
pathlib.Path(env['OLAMIDE_SWITCH_INVENTORY']).write_text(json.dumps(data,indent=2)+'\n')
PY
fi

export OLAMIDE_DOMAIN="$DOMAIN" OLAMIDE_PUBLIC_IP="$PUBLIC_IP"
echo "Checking DNS and SSH before changing the server..."
getent ahostsv4 "$DOMAIN" | awk '{print $1}' | grep -Fx "$PUBLIC_IP" >/dev/null || {
  echo "DNS for $DOMAIN does not point to $PUBLIC_IP." >&2; exit 1;
}
ssh -p "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SSH_USER@$APP_HOST" 'sudo -n true' || {
  echo "SSH key access and passwordless sudo are required for $SSH_USER@$APP_HOST." >&2; exit 1;
}
ansible-inventory -i "$app_inventory" --list >/dev/null
ansible-inventory -i "$switch_inventory" --list >/dev/null
ansible-playbook -i "$app_inventory" "$repo_root/deployment/ansible/site.yml" --syntax-check >/dev/null
ansible-playbook -i "$switch_inventory" "$repo_root/deploy/ansible/site.yml" --vault-password-file "$vault_password_file" --syntax-check >/dev/null

echo "Installing the application and database..."
ansible-playbook -i "$app_inventory" "$repo_root/deployment/ansible/site.yml"
echo "Installing and validating FreeSWITCH..."
ansible-playbook -i "$switch_inventory" "$repo_root/deploy/ansible/site.yml" --vault-password-file "$vault_password_file"
if command -v systemctl >/dev/null && systemctl show-environment >/dev/null 2>&1 && [[ $EUID -ne 0 ]]; then
  "$repo_root/deploy/ansible/install-runner.sh" "$vault_password_file"
else
  echo "No active non-root systemd controller; install the private runner later with deploy/ansible/install-runner.sh and a Vault password file."
fi
echo "Deployment complete. Configure tenant tariffs and carrier gateways in the admin GUI before live calls."
