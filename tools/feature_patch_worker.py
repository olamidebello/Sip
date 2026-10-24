"""Private parser RPC over stdin; optionally isolate Node in the existing API image."""
import json
from pathlib import Path
import shutil
import subprocess
class PatchWorker:
 def __init__(self,source,node_image=None):
  source=Path(source).resolve()
  if node_image:
   command=['docker','run','--rm','-i','--network','none','--read-only','--log-driver','none','--cap-drop','ALL','--security-opt','no-new-privileges','--user','0:0','--mount','type=bind,src='+str(source)+',dst=/controller,readonly','--env','NODE_OPTIONS=','--entrypoint','node',node_image,'/controller/tools/feature-patch-engine.mjs']
  else:
   node=shutil.which('node')
   if not node:raise ValueError('Parser runtime unavailable; no files changed')
   command=[node,str(source/'tools/feature-patch-engine.mjs')]
  self.process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
 def call(self,operation,**fields):
  self.process.stdin.write(json.dumps({'operation':operation,**fields})+'\n');self.process.stdin.flush()
  line=self.process.stdout.readline()
  if not line:raise ValueError('parser_runtime')
  result=json.loads(line)
  if not result.get('ok'):raise ValueError(result.get('code','parser_failure'))
  return result['text']
 def close(self):
  if self.process.poll() is None:
   self.process.stdin.close()
   try:self.process.wait(timeout=10)
   except subprocess.TimeoutExpired:self.process.kill();self.process.wait()
  self.process.stdout.close()
