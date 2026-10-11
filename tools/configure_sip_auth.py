#!/usr/bin/env python3
"""Root-local auth provisioning. Credentials never leave the host or enter logs."""
import json, os, pathlib, re, secrets, subprocess

if os.geteuid()!=0:
    raise SystemExit('Root required')
source=pathlib.Path('/etc/olamide/secrets.env')
values={}
for line in source.read_text().splitlines():
    if line and not line.lstrip().startswith('#') and '=' in line:
        key,value=line.split('=',1);values[key]=value
name=values.get('MYSQL_DATABASE','')
if not re.fullmatch(r'[A-Za-z0-9_]{1,64}',name):
    raise SystemExit('Valid private MySQL database required')
private=pathlib.Path('/etc/olamide/kamailio-auth.json')
password=json.loads(private.read_text())['password'] if private.exists() else secrets.token_hex(32)
if not re.fullmatch(r'[a-f0-9]{64}',password):
    raise SystemExit('Invalid private authentication credential')
private.write_text(json.dumps({'password':password,'database':name}));private.chmod(0o600)
sql=f"CREATE USER IF NOT EXISTS 'olamide_sip_auth'@'%' IDENTIFIED BY '{password}'; ALTER USER 'olamide_sip_auth'@'%' IDENTIFIED BY '{password}'; GRANT SELECT ON `{name}`.`olamide_sip_auth` TO 'olamide_sip_auth'@'%';"
subprocess.run(['docker','compose','--env-file',str(source),'exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root "$MYSQL_DATABASE"'],cwd='/opt/olamide/repo/deployment/docker',input=sql,text=True,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
# Preserve the existing SIP encryption key; create one only if none is configured.
key=values.get('SIP_CREDENTIAL_KEY','')
if key and not re.fullmatch(r'[a-fA-F0-9]{64}',key):
    raise SystemExit('Existing SIP credential key is invalid; refusing rotation')
if not key:
    count=subprocess.check_output(['docker','compose','--env-file',str(source),'exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -N -u root "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM sip_accounts WHERE secret_cipher IS NOT NULL"'],cwd='/opt/olamide/repo/deployment/docker',text=True,stderr=subprocess.DEVNULL).strip()
    if int(count)>0:
        raise SystemExit('Restore the existing SIP encryption key before provisioning')
    key=secrets.token_hex(32)
for path in (source,pathlib.Path('/opt/olamide/repo/deployment/docker/.env')):
    lines=[line for line in path.read_text().splitlines() if not line.startswith('SIP_CREDENTIAL_KEY=')]
    path.write_text('\n'.join(lines)+f'\nSIP_CREDENTIAL_KEY={key}\n');path.chmod(0o600)
