#!/usr/bin/env python3
import importlib.util,json,os,secrets,subprocess,sys,time
from pathlib import Path
ROOT=Path('/opt/olamide/repo/deployment/docker')
def run(args,**kw):return subprocess.run(args,cwd=ROOT,text=True,check=True,**kw)
def guard():
 spec=importlib.util.spec_from_file_location('vpn_ufw',Path(__file__).with_name('vpn-ufw.py'));ufw=importlib.util.module_from_spec(spec);spec.loader.exec_module(ufw)
 ufw.apply('turn','154.29.77.102')
 p=subprocess.run(['nft','-j','list','chain','inet','olamide_guard','input'],text=True,capture_output=True)
 if p.returncode:return
 for proto,ports,label in [('tcp','3478','olamide-turn-tcp'),('udp','{ 3478, 49160-49260 }','olamide-turn-udp')]:
  if label not in p.stdout:run(['nft','insert','rule','inet','olamide_guard','input',proto,'dport',ports,'accept','comment',label])
if len(sys.argv)>1 and sys.argv[1]=='firewall':guard();sys.exit()
if Path('/var/lib/olamide/firewall/pending.json').exists():raise SystemExit('Resolve the pending firewall checkpoint first')
backup=Path('/opt/olamide/backups')/('turn-'+time.strftime('%Y%m%dT%H%M%S',time.gmtime())+'-'+str(os.getpid()));backup.mkdir(mode=0o700,parents=True)
os.umask(0o077)
env=ROOT/'.env';old=env.read_text();(backup/'env.before').write_text(old)
config=json.loads(subprocess.check_output(['docker','compose','config','--format','json'],cwd=ROOT,text=True))
if 'turn' not in config['services']:raise SystemExit('Existing Compose TURN service required')
old_turn=subprocess.check_output(['docker','compose','ps','-q','turn'],cwd=ROOT,text=True).strip()
api=config['services']['api']['environment'];secret=api.get('TURN_SECRET') or secrets.token_hex(32)
if len(secret)<32:raise SystemExit('Existing TURN secret is too short; review before replacement')
values={'TURN_SECRET':secret,'TURN_PUBLIC_HOST':'sip.dobhrap.com','TURN_PUBLIC_IP':'154.29.77.102'}
lines=[l for l in old.splitlines() if not any(l.startswith(k+'=') for k in values)]
try:
 env.write_text('\n'.join(lines+[k+'='+v for k,v in values.items()])+'\n');env.chmod(0o600)
 run(['docker','compose','config','--quiet'])
 # Verify interpolation before starting anything; never print secrets.
 effective=json.loads(subprocess.check_output(['docker','compose','config','--format','json'],cwd=ROOT,text=True))
 assert effective['services']['api']['environment'].get('TURN_SECRET')==secret
 assert effective['services']['turn']['environment'].get('TURN_SECRET')==secret
 run(['docker','compose','--profile','turn','build','turn'],stdin=subprocess.DEVNULL)
 guard()
 run(['docker','compose','--profile','turn','up','-d','--no-deps','turn','api'],stdin=subprocess.DEVNULL)
 run(['curl','-fsS','--max-time','10','--retry','12','--retry-all-errors','--retry-delay','3','https://sip.dobhrap.com/api/health'])
 run(['docker','compose','ps','turn'])
except Exception:
 if not old_turn:subprocess.run(['docker','compose','stop','turn'],cwd=ROOT,stdin=subprocess.DEVNULL)
 env.write_text(old);env.chmod(0o600)
 subprocess.run(['docker','compose','up','-d','--no-deps','api'],cwd=ROOT,stdin=subprocess.DEVNULL)
 raise SystemExit('TURN activation stopped; previous API environment restored. Backup: '+str(backup))
print('TURN configured on UDP/TCP 3478 and relay UDP 49160-49260. Verify a real two-way audio call. Backup: '+str(backup))
