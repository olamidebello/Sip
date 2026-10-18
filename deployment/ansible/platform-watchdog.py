#!/usr/bin/env python3
"""Observe allowlisted services; restart failed services within fixed recovery limits."""
import json,sqlite3,subprocess,time,uuid,os,fcntl,shutil,urllib.request
from pathlib import Path
ROOT=Path('/var/lib/olamide-watchdog')
SERVICES={'docker':('systemd','docker'),'api':('docker','docker-api-1'),'web':('docker','docker-web-1'),'mysql':('docker','docker-mysql-1'),'turn':('docker','docker-turn-1'),'kamailio':('systemd','kamailio'),'rtpengine':('systemd','rtpengine'),'location':('systemd','olamide-location-watchdog')}
RECOVER={'api','web','turn','kamailio','rtpengine','location'}
def run(args,input=None,timeout=15):return subprocess.run(args,input=input,text=True,capture_output=True,timeout=timeout)
def init(db):
 db.execute('CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created REAL NOT NULL)')
 db.execute('CREATE TABLE IF NOT EXISTS checks(component TEXT PRIMARY KEY,failures INTEGER NOT NULL DEFAULT 0,last_status TEXT,last_recovery REAL NOT NULL DEFAULT 0)')
 db.execute('CREATE TABLE IF NOT EXISTS attempts(component TEXT,created REAL)');db.commit()
def emit(db,component,kind,severity,code):
 e={'id':str(uuid.uuid4()),'component':component,'type':kind,'severity':severity,'code':code}
 db.execute('INSERT INTO events VALUES(?,?,?)',(e['id'],json.dumps(e),time.time()));db.commit()
def eligible(component,failures,last_recovery,attempts,now):return component in RECOVER and failures>=3 and now-last_recovery>=600 and attempts<2

def status(name):
 kind,target=SERVICES[name]
 if kind=='systemd':return run(['systemctl','is-active',target]).stdout.strip()=='active'
 result=run(['docker','inspect','--format','{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{end}}',target])
 if result.returncode:return False
 if not result.stdout.startswith('true'):return False
 if 'unhealthy' in result.stdout:return False
 if name=='web':
  with urllib.request.urlopen(os.environ.get('WATCHDOG_PUBLIC_ORIGIN','https://sip.dobhrap.com'),timeout=5) as response:
   return response.status==200 and b'<html' in response.read(65536).lower()
 if name=='api':
  return run(['docker','exec',target,'node','--input-type=module','-e',"const r=await fetch('http://127.0.0.1:8080/api/health',{signal:AbortSignal.timeout(4000)});if(r.status!==200||(await r.json()).status!=='ok')process.exit(1);"],timeout=7).returncode==0
 return True

def bridge(payload):
 r=run(['docker','exec','-i','docker-api-1','node','/app/watchdogHostBridge.js'],json.dumps(payload),timeout=15)
 if r.returncode:raise RuntimeError('Host event bridge unavailable')
 return json.loads(r.stdout)
def cycle(db):
 now=time.time();auto=False
 try:auto=bridge({'action':'settings'}).get('autoRecover') is True
 except Exception:pass
 # A short API outage retains the last authorized setting, for at most one hour.
 policy=ROOT/'policy.json'
 try:
  if auto:policy.write_text(json.dumps({'auto':True,'at':now}));policy.chmod(0o600)
  else:
   try:
    current=bridge({'action':'settings'});policy.write_text(json.dumps({'auto':bool(current.get('autoRecover')),'at':now}));policy.chmod(0o600)
   except Exception:
    cached=json.loads(policy.read_text());auto=cached.get('auto') is True and now-cached.get('at',0)<3600
 except Exception:pass
 docker_up=run(['systemctl','is-active','docker']).stdout.strip()=='active'
 for name in SERVICES:
  if SERVICES[name][0]=='docker' and not docker_up:
   healthy=False
  else:
   try:healthy=status(name)
   except Exception:healthy=False
  row=db.execute('SELECT failures,last_status,last_recovery FROM checks WHERE component=?',(name,)).fetchone() or (0,None,0)
  failures=0 if healthy else row[0]+1;label='healthy' if healthy else 'unhealthy'
  # Refresh heartbeats each cycle; emit transitions and failures as separate events.
  if row[1]!=label:emit(db,name,'health','info' if healthy else 'error',label)
  else:emit(db,name,'heartbeat','info',label)
  db.execute('INSERT INTO checks VALUES(?,?,?,?) ON CONFLICT(component) DO UPDATE SET failures=excluded.failures,last_status=excluded.last_status',(name,failures,label,row[2]));db.commit()
  attempts=db.execute('SELECT COUNT(*) FROM attempts WHERE component=? AND created>?',(name,now-3600)).fetchone()[0]
  if not healthy and auto and docker_up and eligible(name,failures,row[2],attempts,now):
   # Avoid compounding database outages by restarting otherwise dependent containers.
   if name in ('api','web'):
    try:
     if not status('mysql'):continue
    except Exception:continue
   deployment=open('/run/olamide-update.lock','a')
   try:
    try:fcntl.flock(deployment,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:continue
    db.execute('INSERT INTO attempts VALUES(?,?)',(name,now));db.execute('UPDATE checks SET last_recovery=? WHERE component=?',(now,name));db.commit()
    kind,target=SERVICES[name]
    if name=='kamailio' and run(['kamailio','-c','-f','/etc/kamailio/kamailio.cfg']).returncode:
     emit(db,name,'recovery','error','configuration_invalid');continue
    try:
     result=run(['docker','restart',target] if kind=='docker' else ['systemctl','restart',target],timeout=45)
     if result.returncode==0 and name=='kamailio':
      commissioned=run(['docker','exec','docker-api-1','node','/app/commissionPaidCalls.js'],timeout=45)
      if commissioned.returncode:emit(db,name,'recovery','error','carrier_restore_pending')
     emit(db,name,'recovery','warning' if result.returncode==0 else 'error','restart_requested' if result.returncode==0 else 'restart_failed')
    except Exception:emit(db,name,'recovery','error','restart_failed')
   finally:deployment.close()
 usage=shutil.disk_usage(ROOT)
 emit(db,'disk','health','error' if usage.free/usage.total<0.1 else 'info','low_space' if usage.free/usage.total<0.1 else 'healthy')
 try:bridge({'action':'checks'})
 except Exception:pass
 for _ in range(10):
  rows=db.execute('SELECT id,payload FROM events ORDER BY created LIMIT 100').fetchall()
  if not rows:break
  try:bridge({'action':'events','events':[json.loads(r[1]) for r in rows]})
  except Exception:break
  db.executemany('DELETE FROM events WHERE id=?',[(r[0],) for r in rows]);db.commit()
 db.execute('DELETE FROM events WHERE created<?',(now-30*86400,));db.execute('DELETE FROM attempts WHERE created<?',(now-86400,));db.commit()
def main():
 os.umask(0o077);ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
 with (ROOT/'lock').open('w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  db=sqlite3.connect(ROOT/'events.sqlite');init(db)
  while True:
   try:cycle(db)
   except Exception:print('Watchdog cycle pending',flush=True)
   time.sleep(20)
if __name__=='__main__':main()
