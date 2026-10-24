"""Private staging, image pinning and narrow file promotion; never rewrites Git/config."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

command,live_name,stage_name,backup_name=sys.argv[1:]
live,stage,backup=map(lambda p:Path(p).resolve(),[live_name,stage_name,backup_name])
compose_dir=live/'deployment/docker'
config=json.loads((backup/'effective-compose.json').read_text())

def run(args):return subprocess.check_output(args,cwd=compose_dir,text=True).strip()
def write(name,obj):(backup/name).write_text(json.dumps(obj))
def read(name):return json.loads((backup/name).read_text())
def rebase(value):
 if isinstance(value,str) and (value==str(live) or value.startswith(str(live)+'/')):return str(stage)+value[len(str(live)):]
 if isinstance(value,list):return [rebase(x) for x in value]
 if isinstance(value,dict):return {k:rebase(v) for k,v in value.items()}
 return value

def entries():
 spec=importlib.util.spec_from_file_location('installer',Path(__file__).with_name('install-local-features.py'))
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 allowed=set(module.NEW_FILES+module.SHARED)
 result=read('manifest.json')['files']
 for item in result:
  name=item['path']
  if name not in allowed:raise ValueError('Unexpected promotion path')
  for root in [live,stage]:
   p=root/name
   if p.is_symlink() or not p.resolve().is_relative_to(root):raise ValueError('Symlinked promotion path')
   for parent in p.parents:
    if parent==root:break
    if parent.is_symlink():raise ValueError('Symlinked promotion parent')
 return result

def matches(item):
 p=live/item['path']
 if not item['existed']:return not p.exists()
 return p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==item['before_sha256']

def copy_atomic(source,destination):
 destination.parent.mkdir(parents=True,exist_ok=True)
 fd,name=tempfile.mkstemp(prefix='.feature-copy-',dir=destination.parent);os.close(fd)
 try:shutil.copy2(source,name);os.replace(name,destination)
 finally:
  if os.path.exists(name):os.unlink(name)

if command=='prepare':
 staged=rebase(config);images={}
 for service in ['api','web']:
  build=staged['services'][service].get('build')
  context=build.get('context') if isinstance(build,dict) else build
  if not context or Path(context).resolve()!=stage:raise ValueError('Unsupported build context for '+service)
  dockerfile=build.get('dockerfile','Dockerfile') if isinstance(build,dict) else 'Dockerfile'
  if (stage/dockerfile).resolve()!=stage/'deployment/docker'/f'{service}.Dockerfile':raise ValueError('Unsupported Dockerfile for '+service)
  target=config['services'][service].get('image')
  if not target:
   if not config.get('name'):raise ValueError('Compose project name unavailable')
   target=config['name']+'-'+service
  images[service]={'new':'olamide-feature-'+service+':'+backup.name,'target':target,'rollback':'olamide-rollback-'+service+':'+backup.name}
  staged['services'][service]['image']=images[service]['new']
 write('images.json',images);write('stage-compose.json',staged)
elif command=='pin':
 images=read('images.json');rollback={'services':{}}
 for service,values in images.items():
  cid=run(['docker','compose','ps','-q',service])
  if not cid:raise ValueError('Running service required: '+service)
  image=run(['docker','inspect','--format','{{.Image}}',cid])
  run(['docker','tag',image,values['rollback']]);rollback['services'][service]={'image':values['rollback']}
 write('rollback-images.json',rollback)
elif command=='save':
 for item in entries():
  if not matches(item):raise ValueError('Live source changed during staging; no files promoted')
 for item in entries():
  if item['existed']:
   destination=backup/'touched-originals'/item['path'];destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(live/item['path'],destination)
elif command=='promote':
 if json.loads(run(['docker','compose','config','--format','json']))!=config:raise ValueError('Live Compose configuration changed during staging; no files promoted')
 items=entries()
 if not all(matches(item) for item in items):raise ValueError('Live source changed during staging; no files promoted')
 promoted=[];write('promoted.json',promoted)
 for item in items:
  promoted.append(item);write('promoted.json',promoted)
  copy_atomic(stage/item['path'],live/item['path'])
elif command=='restore':
 if (backup/'promoted.json').exists():
  for item in read('promoted.json'):
   if item['existed']:copy_atomic(backup/'touched-originals'/item['path'],live/item['path'])
   else:(live/item['path']).unlink(missing_ok=True)
elif command in ['tag-release','tag-rollback']:
 for values in read('images.json').values():run(['docker','tag',values['new' if command=='tag-release' else 'rollback'],values['target']])
else:raise ValueError('Unknown release operation')
