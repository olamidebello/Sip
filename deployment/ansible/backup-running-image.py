#!/usr/bin/env python3
"""Keep a private recovery image even when Docker lost its original content layers."""
import argparse,http.client,json,os,re,socket,subprocess,tempfile,uuid
from pathlib import Path
from urllib.parse import urlencode
CONFIG_FIELDS=('Env','Cmd','Entrypoint','WorkingDir','User','ExposedPorts','Labels','StopSignal','Shell','Healthcheck','Volumes')
def recovery_config(config):
 return {key:config[key] for key in CONFIG_FIELDS if key in config and config[key] is not None}
class DockerConnection(http.client.HTTPConnection):
 def __init__(self):super().__init__('localhost',timeout=600)
 def connect(self):self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(self.timeout);self.sock.connect('/var/run/docker.sock')
def api(method,path,body=None):
 connection=DockerConnection()
 try:
  payload=json.dumps(body).encode() if body is not None else None
  connection.request(method,path,body=payload,headers={'Content-Type':'application/json'})
  response=connection.getresponse();data=response.read()
  if response.status>=300:raise RuntimeError('Docker engine operation failed with HTTP '+str(response.status))
  return json.loads(data) if data else {}
 finally:connection.close()
def run(argv,**kwargs):return subprocess.run(argv,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kwargs)
def backup(container,tag,directory):
 if not re.fullmatch(r'docker-(api|web)-1',container):raise ValueError('Expected API or web container')
 if not re.fullmatch(r'olamide-(api|web):before-did-[0-9]{14}',tag):raise ValueError('Invalid private recovery tag')
 if ('-api-' in container)!=tag.startswith('olamide-api:'):raise ValueError('Recovery image/service mismatch')
 inspect=json.loads(run(['docker','inspect',container]).stdout)[0]
 # Saving verifies actual layer content, not just the image metadata record.
 try:
  run(['docker','tag',inspect['Image'],tag])
  with open(os.devnull,'wb') as sink:subprocess.run(['docker','image','save',tag],check=True,stdout=sink,stderr=subprocess.PIPE)
  print('Recovery image verified');return
 except subprocess.CalledProcessError:pass
 root=Path(directory);root.mkdir(parents=True,exist_ok=True,mode=0o700)
 temp_name='olamide-recovery-'+uuid.uuid4().hex
 imported='olamide-recovery:'+uuid.uuid4().hex
 created=False
 try:
  with tempfile.TemporaryDirectory(prefix='rootfs-',dir=root) as work:
   archive=Path(work)/'filesystem.tar'
   with archive.open('wb') as output:
    os.chmod(archive,0o600)
    subprocess.run(['docker','export',container],check=True,stdout=output,stderr=subprocess.PIPE)
   run(['docker','image','import',str(archive),imported])
   run(['docker','create','--name',temp_name,imported,'/bin/true']);created=True
   repository,label=tag.rsplit(':',1)
   api('POST','/commit?'+urlencode({'container':temp_name,'repo':repository,'tag':label,'pause':'false'}),recovery_config(inspect['Config']))
   restored=json.loads(run(['docker','image','inspect',tag]).stdout)[0]['Config']
   expected=recovery_config(inspect['Config'])
   mismatched=[key for key,value in expected.items() if restored.get(key)!=value]
   if mismatched:raise RuntimeError('Recovery startup configuration mismatch in fields: '+','.join(mismatched))
   with open(os.devnull,'wb') as sink:subprocess.run(['docker','image','save',tag],check=True,stdout=sink,stderr=subprocess.PIPE)
   print('Recovery image reconstructed from running filesystem; startup configuration preserved')
 finally:
  if created:subprocess.run(['docker','rm','-v',temp_name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  subprocess.run(['docker','image','rm',imported],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('container');parser.add_argument('tag');parser.add_argument('--directory',default='/etc/olamide/didshop-backups');args=parser.parse_args()
 try:backup(args.container,args.tag,args.directory)
 except subprocess.CalledProcessError as error:
  # Never print inspect/configuration data or arbitrary upstream output.
  detail=error.stderr.decode('utf8','replace') if isinstance(error.stderr,bytes) else str(error.stderr or '')
  category='missing Docker content' if re.search(r'not found|NotFound',detail,re.I) else 'disk capacity' if 'no space left' in detail.lower() else 'Docker filesystem export/import operation'
  parser.exit(1,'Recovery backup failed: '+category+'. Running containers were not replaced.\n')
 except RuntimeError as error:parser.exit(1,str(error)+'. Running containers were not replaced.\n')
 except Exception as error:parser.exit(1,'Recovery backup failed: '+type(error).__name__+'. Running containers were not replaced.\n')
