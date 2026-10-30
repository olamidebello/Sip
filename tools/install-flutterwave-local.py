#!/usr/bin/env python3
"""Apply reviewed payment files with staged three-way merges; keep local fixes."""
import argparse
import difflib
import re
from pathlib import Path
import subprocess
import tempfile

BASE='73fd872f8e4cbf6f896be02c6932f0eee4e16454'
FILES=(
 'services/api/flutterwaveWebhook.js','services/api/flutterwaveWebhook.test.js',
 'services/api/nairaPayments.js','services/api/nairaPayments.test.js',
 'services/api/storeGateways.js','services/api/server.js','services/api/payments.js',
 'apps/web/src/main.js','apps/web/src/marketplaceControl.js',
 'tools/provision-flutterwave.mjs','tools/provision-flutterwave.sh',
 'docs/flutterwave-webhook.md','docs/flutterwave-auto-provision.md','docs/naira-payments.md',
)

def integrate_server(text):
 """Add routes to the local router without merging unrelated route changes."""
 def unique(pattern,change,label):
  nonlocal text
  matches=list(re.finditer(pattern,text,re.M))
  if len(matches)!=1:raise RuntimeError('Router integration anchor missing or ambiguous: '+label)
  match=matches[0];text=text[:match.start()]+change(match.group())+text[match.end():]
 imported="import {handleFlutterwaveWebhook} from './flutterwaveWebhook.js';\n"
 if imported.strip() not in text:text=imported+text
 if not re.search(r'\bconst\s+flutterwaveWebhook\s*=',text):
  unique(r'^\s*const providerWebhook=.*;$',lambda s:'  const flutterwaveWebhook=path.startsWith("/api/webhooks/flutterwave/");\n'+s,'webhook classification')
 # Keep every local origin exemption and rate-limit classification intact.
 def origin_guard(line):
  if '!flutterwaveWebhook' not in line:
   if '!providerWebhook' not in line:raise RuntimeError('Provider origin exemption missing')
   line=line.replace('!providerWebhook','!flutterwaveWebhook && !providerWebhook',1)
  return line
 unique(r'^.*if\s*\(.*req\.method.*req\.headers\.origin.*$',origin_guard,'origin guard')
 def external_classification(line):
  if not re.search(r'\bflutterwaveWebhook\b',line):
   if 'providerWebhook' not in line:raise RuntimeError('External provider classification missing')
   line=line.replace('providerWebhook','flutterwaveWebhook||providerWebhook',1)
  return line
 unique(r'^\s*const external=.*;$',external_classification,'external rate limits')
 if 'return await handleFlutterwaveWebhook({req,res,path,pool,send})' not in text:
  unique(r'^\s*if\s*\(providerWebhook\).*handleProviderWebhook.*$',lambda s:'    if (flutterwaveWebhook) return await handleFlutterwaveWebhook({req,res,path,pool,send});\n'+s,'public webhook dispatch')
 if "path==='/api/admin/marketplace/naira'" not in text:
  unique(r'^.*if\s*\(path\.startsWith\(\'/api/marketplace/\'\).*handleStoreGateways.*$',lambda s:"      if(path==='/api/admin/marketplace/naira') return await handleStoreGateways({req,res,path,user,pool,send,readJson,origin});\n"+s,'naira settings dispatch')
 return text

def integrate_ui(text,base,incoming,path):
 """Apply only uniquely identified feature edits, retaining adjacent UI fixes."""
 original=base.splitlines(keepends=True);updated=incoming.splitlines(keepends=True)
 edits=difflib.SequenceMatcher(a=original,b=updated,autojunk=False).get_opcodes()
 for kind,start,end,new_start,new_end in reversed(edits):
  if kind=='equal':continue
  old=''.join(original[start:end]);new=''.join(updated[new_start:new_end])
  if kind=='insert':
   if start==0:raise RuntimeError('Unrecognized UI insertion: '+path)
   anchor=original[start-1]
   if text.count(anchor+new)==1:continue
   if text.count(anchor)!=1:raise RuntimeError('UI insertion anchor missing or ambiguous: '+path)
   text=text.replace(anchor,anchor+new,1)
  else:
   if new and text.count(new)==1:continue
   if not old or text.count(old)!=1:raise RuntimeError('UI payment edit missing or ambiguous; no files written: '+path)
   text=text.replace(old,new,1)
 return text

def install(root,ref):
 root=Path(root).resolve()
 def git(*args,check=True):
  return subprocess.run(['git',*args],cwd=root,capture_output=True,check=check)
 target=git('rev-parse','--verify',ref+'^{commit}').stdout.decode().strip()
 git('merge-base','--is-ancestor',BASE,target)
 if git('ls-files','-u').stdout:raise RuntimeError('Resolve existing merge conflicts first')
 pending={}
 with tempfile.TemporaryDirectory() as work:
  for path in FILES:
   destination=root/path
   if not destination.resolve().is_relative_to(root):raise RuntimeError('Path escapes checkout: '+path)
   incoming=git('show',target+':'+path).stdout
   original=git('show',BASE+':'+path,check=False)
   ours=destination.read_bytes() if destination.exists() else None
   if ours==incoming:continue
   if path=='services/api/server.js':
    if ours is None:raise RuntimeError('Local router missing')
    pending[path]=integrate_server(ours.decode()).encode()
    continue
   if original.returncode:
    if ours is not None:raise RuntimeError('Existing custom file requires review: '+path)
    pending[path]=incoming;continue
   if ours is None:raise RuntimeError('Local source file missing: '+path)
   if path in ('apps/web/src/main.js','apps/web/src/marketplaceControl.js'):
    pending[path]=integrate_ui(ours.decode(),original.stdout.decode(),incoming.decode(),path).encode()
    continue
   files=[Path(work)/name for name in ('ours','base','incoming')]
   for file,data in zip(files,(ours,original.stdout,incoming)):file.write_bytes(data)
   merged=subprocess.run(['git','merge-file','-p',*map(str,files)],capture_output=True)
   if merged.returncode:raise RuntimeError('Three-way merge conflict; no files written: '+path)
   pending[path]=merged.stdout
 # Validate every file and merge before changing any application source.
 for path,data in pending.items():
  destination=root/path;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
 print('Applied Flutterwave and naira payment changes: '+target)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--root',default='/opt/olamide/repo');parser.add_argument('--ref',required=True)
 args=parser.parse_args();install(args.root,args.ref)
