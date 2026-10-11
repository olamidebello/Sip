#!/usr/bin/env python3
"""Single-host maintenance rollout with a real DB backup and image-based app rollback."""
import argparse,fcntl,gzip,json,os,re,shutil,subprocess,time,threading
from pathlib import Path
from datetime import datetime,timezone
from runtime_secrets import atomic_write

class DeploymentError(RuntimeError):pass

def run(argv,*,cwd=None,input=None,allow_failure=False):
 try:result=subprocess.run(argv,cwd=cwd,input=input,text=True,capture_output=True,timeout=1800)
 except subprocess.TimeoutExpired:raise DeploymentError('Command timed out: '+str(argv[0])+' (private arguments suppressed)')
 if result.returncode and not allow_failure:raise DeploymentError('Command failed: '+str(argv[0])+' (private output suppressed)')
 return result

class Release:
 def __init__(self,repo,ref,backup_argv=None):
  self.repo=Path(repo);self.ref=ref;self.backup_argv=backup_argv or []
  self.directory=self.repo/'deployment/docker';self.override=Path('/etc/olamide/production-images.json');self.canonical=Path('/etc/olamide/secrets.env')
  self.backups=Path('/opt/olamide/backups');self.previous_ref=None;self.previous_images={};self.previous_env=None;self.previous_override=None;self.cutover=False;self.created_database=False
  self.identifier=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
 def compose(self,*args,override=True,input=None,allow_failure=False):
  cmd=['docker','compose','-f',str(self.directory/'compose.yml')]
  if override and self.override.exists():cmd+=['-f',str(self.override)]
  return run(cmd+list(args),cwd=self.directory,input=input,allow_failure=allow_failure)
 def image(self,service):
  container=self.compose('ps','-q',service,override=False).stdout.strip()
  if not container:return None
  return run(['docker','inspect','--format','{{.Image}}',container]).stdout.strip()
 def snapshot(self):
  if (self.repo/'.git').exists():
   if run(['git','status','--porcelain','--untracked-files=no'],cwd=self.repo).stdout.strip():raise DeploymentError('Tracked local changes block deployment')
   self.previous_ref=run(['git','rev-parse','HEAD'],cwd=self.repo).stdout.strip()
   env=self.directory/'.env';self.previous_env=env.read_text() if env.exists() else None
   self.previous_override=self.override.read_text() if self.override.exists() else None
   for service in ['api','web','turn','mysql']:
    image=self.image(service)
    if image:
     tag='olamide-'+service+':rollback-'+self.identifier
     run(['docker','tag',image,tag]);self.previous_images[service]=tag
 def checkout(self):
  if self.previous_ref:run(['git','fetch','origin','main'],cwd=self.repo)
  else:run(['git','clone','https://github.com/olamidebello/Sip.git',str(self.repo)])
  run(['git','cat-file','-e',self.ref+'^{commit}'],cwd=self.repo)
  run(['git','merge-base','--is-ancestor',self.ref,'origin/main'],cwd=self.repo)
  if self.previous_ref:run(['git','merge-base','--is-ancestor',self.previous_ref,self.ref],cwd=self.repo)
  run(['git','checkout','--detach',self.ref],cwd=self.repo)
  if not (self.repo/'services/api/bootstrap-production-admin.js').exists():raise DeploymentError('Selected validated release predates unattended production support; wait for CI or select a tested newer SHA')
 def write_images(self,images):
  services={name:{'image':image} for name,image in images.items()}
  if 'api' in images:services['migrate']={'image':images['api']}
  atomic_write(self.override,json.dumps({'services':services}))
 def backup(self):
  container=self.compose('ps','-q','mysql',override=False).stdout.strip()
  if not container:self.created_database=True;return
  self.backups.mkdir(parents=True,exist_ok=True);os.chmod(self.backups,0o700)
  backup=self.backups/('olamide-'+self.identifier+'.sql.gz');temporary=backup.with_suffix('.pending')
  # Dump password stays in the MySQL container's environment, never argv/logs.
  command=['docker','exec',container,'sh','-c','exec mysqldump --single-transaction --routines --events --triggers --no-tablespaces --set-gtid-purged=OFF -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"']
  with open(temporary,'wb') as output:
   os.chmod(temporary,0o600)
   with subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL) as process:
    deadline=threading.Timer(1800,process.kill);deadline.daemon=True;deadline.start()
    try:
     with gzip.GzipFile(fileobj=output,mode='wb') as compressed:shutil.copyfileobj(process.stdout,compressed)
     code=process.wait()
    except BaseException:
     process.kill();raise
    finally:deadline.cancel()
    if code!=0:temporary.unlink(missing_ok=True);raise DeploymentError('Database backup failed; schema was not modified')
  with gzip.open(temporary,'rb') as verified:
   total=0
   while True:
    chunk=verified.read(1048576)
    if not chunk:break
    total+=len(chunk)
   if not total:temporary.unlink(missing_ok=True);raise DeploymentError('Empty database backup')
  os.replace(temporary,backup)
  if self.backup_argv:run(self.backup_argv+[str(backup)])
  return str(backup)
 def deploy(self):
  self.snapshot()
  backup=self.backup()
  self.checkout()
  canonical=self.canonical
  lines=[line for line in canonical.read_text().splitlines() if not line.startswith('APP_RELEASE=')];lines.append('APP_RELEASE='+self.ref);atomic_write(canonical,'\n'.join(lines)+'\n')
  shutil.copyfile(self.canonical,self.directory/'.env');os.chmod(self.directory/'.env',0o600)
  images={s:'olamide-'+s+':'+self.ref for s in ['api','web','turn']}
  if self.previous_images.get('mysql'):images['mysql']=self.previous_images['mysql']
  else:
   mysql_image=run(['docker','image','inspect','mysql:8.4','--format','{{.Id}}']).stdout.strip()
   images['mysql']='olamide-mysql:'+self.ref
   run(['docker','tag',mysql_image,images['mysql']])
  self.write_images(images)
  self.compose('config','--quiet')
  self.compose('build','--pull','api','web','turn')
  # Keep existing callers' administrative scripts compatible with the API local tag.
  run(['docker','tag',images['api'],'olamide-api:local'])
  self.cutover=True
  self.compose('up','-d','--wait','--wait-timeout','300','mysql','turn')
  self.compose('run','--rm','migrate')
  self.compose('run','--rm','--no-deps','-T','api','node','bootstrap-production-admin.js',input=(self.canonical.parent/'initial-admin.json').read_text())
  self.compose('up','-d','--no-deps','api','web')
  self.health()
  if not backup:backup=self.backup()
  domain=next(line.split('=',1)[1] for line in self.canonical.read_text().splitlines() if line.startswith('DOMAIN='))
  for attempt in range(24):
   if run(['python3','/usr/local/lib/olamide-production/check-public.py','--domain',domain,'--release',self.ref],allow_failure=True).returncode==0:break
   if attempt==23:raise DeploymentError('Public TLS/API/GUI readiness failed')
   time.sleep(5)
  atomic_write(self.canonical.parent/'production-release.json',json.dumps({'release':self.ref,'previous_release':self.previous_ref,'backup':backup,'images':images,'deployed_at':self.identifier,'status':'application_ready_pending_call_acceptance'}))
 def health(self):
  script="const mysql=require('mysql2/promise');(async()=>{const p=await mysql.createConnection(process.env.MYSQL_URL);await p.query('SELECT 1');await p.end();const r=await fetch('http://127.0.0.1:8080/api/health');if(!r.ok)process.exit(1)})().catch(()=>process.exit(1))"
  for _ in range(24):
   if self.compose('exec','-T','api','node','-e',script,allow_failure=True).returncode==0:return
   time.sleep(5)
  raise DeploymentError('API/database readiness failed')
 def rollback(self):
  if not self.previous_ref:
   if self.cutover:self.compose('stop','api','web','turn',allow_failure=True)
   raise DeploymentError('Initial deployment failed; application stopped, database and credentials preserved')
  if self.cutover and 'turn' not in self.previous_images:self.compose('stop','turn',allow_failure=True)
  run(['git','checkout','--detach',self.previous_ref],cwd=self.repo)
  if self.previous_env is not None:
   atomic_write(self.directory/'.env',self.previous_env)
   canonical=self.canonical
   if canonical.exists():
    lines=[line for line in canonical.read_text().splitlines() if not line.startswith('APP_RELEASE=')];previous=next((line for line in self.previous_env.splitlines() if line.startswith('APP_RELEASE=')),None)
    if previous:lines.append(previous)
    atomic_write(canonical,'\n'.join(lines)+'\n')
  if not self.cutover:
   if self.previous_override is not None:atomic_write(self.override,self.previous_override)
   else:self.override.unlink(missing_ok=True)
   return
  if not all(s in self.previous_images for s in ['api','web']):
   self.compose('stop','api','web','turn',allow_failure=True)
   raise DeploymentError('No complete running application to restore; database and backup preserved')
  self.write_images(self.previous_images)
  run(['docker','tag',self.previous_images['api'],'olamide-api:local'])
  services=[s for s in ['api','web','turn'] if s in self.previous_images]
  self.compose('up','-d','--no-deps','--no-build',*services)
  self.health()
  atomic_write(self.canonical.parent/'production-release.json',json.dumps({'release':self.previous_ref,'failed_release':self.ref,'status':'application_rolled_back_database_migrations_preserved'}))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',default='/opt/olamide/repo');p.add_argument('--ref',required=True);p.add_argument('--backup-argv-json',default='[]');args=p.parse_args()
 if not re.fullmatch('[0-9a-f]{40}',args.ref) or args.repo!='/opt/olamide/repo':raise SystemExit('Fixed release and supported production path required')
 backup_argv=json.loads(args.backup_argv_json)
 if not isinstance(backup_argv,list) or any(not isinstance(v,str) or not v for v in backup_argv):raise SystemExit('Invalid backup command')
 with open('/run/olamide-update.lock','a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise SystemExit('Another deployment/update holds the server lock')
  release=Release(args.repo,args.ref,backup_argv)
  try:release.deploy()
  except Exception as error:
   try:release.rollback()
   except Exception as rollback_error:raise SystemExit(str(rollback_error))
   raise SystemExit(str(error)+'; previous application restored, additive database migrations retained')
 print('Application release installed. Final production acceptance must still pass.')
