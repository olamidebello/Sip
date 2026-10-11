#!/usr/bin/env python3
"""Generate missing internal secrets; preserve deployed credentials on every rerun."""
import argparse,json,os,re,secrets
from pathlib import Path
KEYS=['MYSQL_PASSWORD','MYSQL_ROOT_PASSWORD','SIP_CREDENTIAL_KEY','PROVIDER_CREDENTIAL_KEY','PAYMENT_CONFIG_KEY','OTP_HMAC_SECRET','KAMAILIO_RUNNER_TOKEN','DEPLOY_RUNNER_TOKEN','FLOWROUTE_WEBHOOK_TOKEN','DIDWW_CALL_EVENTS_TOKEN','NATIVE_PUSH_HOOK_TOKEN','TURN_SECRET']
STABLE=['MYSQL_PASSWORD','MYSQL_ROOT_PASSWORD','MYSQL_URL','MYSQL_DATABASE','MYSQL_USER','SIP_CREDENTIAL_KEY','PROVIDER_CREDENTIAL_KEY','PAYMENT_CONFIG_KEY']
def parse(text):
 result={}
 for line in text.splitlines():
  if not line or line.startswith('#'):continue
  if '=' not in line:raise ValueError('Invalid environment line')
  name,value=line.split('=',1)
  if not re.fullmatch('[A-Z][A-Z0-9_]*',name) or name in result:raise ValueError('Invalid or duplicate environment setting')
  if value.startswith(('"',"'")):raise ValueError('Use unquoted env values for this deployment profile')
  result[name]=value
 return result

def merge(canonical,deployed,supplied,domain,public_ip):
 for key in STABLE:
  values={s[key] for s in [canonical,deployed,supplied] if s.get(key)}
  if len(values)>1:raise ValueError('Conflicting existing credential: '+key)
 data={}
 for source in [deployed,canonical,supplied]:
  for key,value in source.items():
   if key in STABLE+KEYS and not value and data.get(key):continue
   data[key]=value
 if data.get('DOMAIN') and data['DOMAIN']!=domain:raise ValueError('Existing deployment domain differs')
 for key in KEYS:
  if not data.get(key):data[key]=secrets.token_hex(32)
  if len(data[key])<32 or '\n' in data[key]:raise ValueError('Secret too short: '+key)
 for key in ['SIP_CREDENTIAL_KEY','PROVIDER_CREDENTIAL_KEY','PAYMENT_CONFIG_KEY']:
  if not re.fullmatch('[a-fA-F0-9]{64}',data[key]):raise ValueError('Encryption key must be 32 bytes of hex: '+key)
 data['DOMAIN']=domain
 data.setdefault('MYSQL_DATABASE','olamide');data.setdefault('MYSQL_USER','olamide_app')
 for key in ['MYSQL_DATABASE','MYSQL_USER']:
  if not re.fullmatch('[A-Za-z0-9_]{1,64}',data[key]):raise ValueError('Invalid database identity')
 if not data.get('MYSQL_URL'):
  from urllib.parse import quote
  data['MYSQL_URL']='mysql://'+quote(data['MYSQL_USER'],safe='')+':'+quote(data['MYSQL_PASSWORD'],safe='')+'@mysql:3306/'+data['MYSQL_DATABASE']
 from urllib.parse import urlparse,unquote
 url=urlparse(data['MYSQL_URL'])
 if url.scheme!='mysql' or url.hostname!='mysql' or unquote(url.username or '')!=data['MYSQL_USER'] or unquote(url.password or '')!=data['MYSQL_PASSWORD'] or url.path!='/'+data['MYSQL_DATABASE']:raise ValueError('Database URL and existing database identity differ')
 data.setdefault('SIP_ACCOUNT_DOMAIN',domain);data.setdefault('SIP_PROVISION_MODE','remote');data.setdefault('SIP_WS_UPSTREAM','127.0.0.1:9')
 data.setdefault('MEETING_ICE_SERVERS_JSON','[]')
 # TURN is a required part of this calling production profile. No automatic firewall resets.
 data['TURN_PUBLIC_HOST']=domain;data['TURN_PUBLIC_IP']=public_ip
 profiles={p.strip() for p in data.get('COMPOSE_PROFILES','').split(',') if p.strip()};profiles.add('turn');data['COMPOSE_PROFILES']=','.join(sorted(profiles))
 return data

def atomic_write(path,text,mode=0o600):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 temporary=path.with_name(path.name+'.pending');fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,mode);os.chmod(temporary,mode)
 with os.fdopen(fd,'w') as f:f.write(text);f.flush();os.fsync(f.fileno())
 os.replace(temporary,path)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--canonical',required=True);p.add_argument('--deployed',required=True);p.add_argument('--supplied');p.add_argument('--domain',required=True);p.add_argument('--public-ip',required=True);p.add_argument('--admin-email',required=True);a=p.parse_args()
 import ipaddress
 if not re.fullmatch('[a-z0-9.-]+',a.domain) or not ipaddress.ip_address(a.public_ip).is_global:raise SystemExit('Public IP and valid domain required')
 if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+',a.admin_email) or 'REPLACE' in a.admin_email:raise SystemExit('Valid initial administrator email required')
 read=lambda name:parse(Path(name).read_text()) if name and Path(name).exists() else {}
 data=merge(read(a.canonical),read(a.deployed),read(a.supplied),a.domain,a.public_ip)
 atomic_write(a.canonical,''.join(k+'='+v+'\n' for k,v in sorted(data.items())))
 initial=Path(a.canonical).parent/'initial-admin.json'
 if not initial.exists():atomic_write(initial,json.dumps({'email':a.admin_email.lower(),'password':secrets.token_urlsafe(40)}))
 print('Private runtime credentials preserved and configured.')
