#!/usr/bin/env python3
import importlib.util,json,os,secrets,subprocess,sys,time
from pathlib import Path
import yaml
ROOT=Path('/opt/olamide/repo/deployment/docker')
def run(args,**kw):return subprocess.run(args,cwd=ROOT,text=True,check=True,**kw)
def guard():
 spec=importlib.util.spec_from_file_location('vpn_ufw',Path(__file__).with_name('vpn-ufw.py'));ufw=importlib.util.module_from_spec(spec);spec.loader.exec_module(ufw)
 ufw.apply('turn','154.29.77.102')
 p=subprocess.run(['nft','-j','list','chain','inet','olamide_guard','input'],text=True,capture_output=True)
 if p.returncode:return
 for proto,ports,label in [('tcp','3478','olamide-turn-tcp'),('udp','{ 3478, 49160-49260 }','olamide-turn-udp')]:
  if label not in p.stdout:run(['nft','insert','rule','inet','olamide_guard','input',proto,'dport',ports,'accept','comment',label])
def envmap(service):
 value=service.get('environment',{})
 if isinstance(value,list):value=dict(item.split('=',1) if '=' in item else (item,None) for item in value)
 if not isinstance(value,dict):raise ValueError('Unsupported Compose environment format')
 service['environment']=value;return value
def ensure_turn(config):
 services=config.get('services',{})
 if 'api' not in services:raise ValueError('API service required')
 api=envmap(services['api'])
 for k in ['TURN_SECRET','TURN_PUBLIC_HOST']:
  if not api.get(k):api[k]='${'+k+':-}'
 if 'turn' not in services:
  services['turn']={'profiles':['turn'],'build':{'context':'../..','dockerfile':'deployment/docker/turn.Dockerfile'},'restart':'unless-stopped','network_mode':'host','environment':{'DOMAIN':'${DOMAIN:?set domain}','TURN_PUBLIC_IP':'${TURN_PUBLIC_IP:-}','TURN_SECRET':'${TURN_SECRET:-}'}}
 else:
  turn=services['turn'];env=envmap(turn)
  for k in ['TURN_PUBLIC_IP','TURN_SECRET']:
   if not env.get(k):env[k]='${'+k+':-}'
  if turn.get('profiles') and 'turn' not in turn['profiles']:turn['profiles'].append('turn')
 return config

def main():
 if len(sys.argv)>1 and sys.argv[1]=='firewall':guard();return
 if Path('/var/lib/olamide/firewall/pending.json').exists():raise SystemExit('Resolve the pending firewall checkpoint first')
 os.umask(0o077)
 backup=Path('/opt/olamide/backups')/('turn-'+time.strftime('%Y%m%dT%H%M%S',time.gmtime())+'-'+str(os.getpid()));backup.mkdir(mode=0o700,parents=True)
 env=ROOT/'.env';old=env.read_text();(backup/'env.before').write_text(old)
 compose=ROOT/'compose.yml';old_compose=compose.read_text();(backup/'compose.before.yml').write_text(old_compose)
 raw=yaml.safe_load(old_compose);old_turn=''
 try:
  if 'turn' in raw.get('services',{}):old_turn=subprocess.check_output(['docker','compose','--profile','turn','ps','-q','turn'],cwd=ROOT,text=True).strip()
  ensure_turn(raw);compose.write_text(yaml.safe_dump(raw,sort_keys=False))
  config=json.loads(subprocess.check_output(['docker','compose','--profile','turn','config','--format','json'],cwd=ROOT,text=True))
  if 'turn' not in config['services']:raise ValueError('TURN service missing from profile-enabled Compose configuration')
  api=config['services']['api']['environment'];secret=api.get('TURN_SECRET') or secrets.token_hex(32)
  if len(secret)<32 or any(c.isspace() or c in '#\"\'' for c in secret):raise ValueError('Existing TURN secret requires review')
  values={'TURN_SECRET':secret,'TURN_PUBLIC_HOST':api.get('TURN_PUBLIC_HOST') or 'sip.dobhrap.com','TURN_PUBLIC_IP':'154.29.77.102'}
  lines=[l for l in old.splitlines() if not any(l.startswith(k+'=') for k in values)]
  env.write_text('\n'.join(lines+[k+'='+v for k,v in values.items()])+'\n');env.chmod(0o600)
  run(['docker','compose','--profile','turn','config','--quiet'])
  effective=json.loads(subprocess.check_output(['docker','compose','--profile','turn','config','--format','json'],cwd=ROOT,text=True))
  if effective['services']['api']['environment'].get('TURN_SECRET')!=secret or effective['services']['turn']['environment'].get('TURN_SECRET')!=secret:raise ValueError('API and TURN secret interpolation differs; previous configuration preserved')
  run(['docker','compose','--profile','turn','build','turn'],stdin=subprocess.DEVNULL)
  guard()
  run(['docker','compose','--profile','turn','up','-d','--no-deps','turn','api'],stdin=subprocess.DEVNULL)
  run(['curl','-fsS','--max-time','10','--retry','12','--retry-all-errors','--retry-delay','3','https://sip.dobhrap.com/api/health'])
  run(['docker','compose','--profile','turn','ps','turn'])
 except Exception as error:
  if not old_turn:subprocess.run(['docker','compose','--profile','turn','stop','turn'],cwd=ROOT,stdin=subprocess.DEVNULL)
  env.write_text(old);env.chmod(0o600);compose.write_text(old_compose)
  subprocess.run(['docker','compose','up','-d','--no-deps','api'],cwd=ROOT,stdin=subprocess.DEVNULL)
  raise SystemExit('TURN activation stopped; previous Compose/environment restored. '+(str(error) if isinstance(error,ValueError) else 'See command error above.')+' Backup: '+str(backup))
 print('TURN configured on UDP/TCP 3478 and relay UDP 49160-49260. Test two-way audio. Backup: '+str(backup))
if __name__=='__main__':main()
