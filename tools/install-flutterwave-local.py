#!/usr/bin/env python3
"""Apply reviewed payment files with staged three-way merges; keep local fixes."""
import argparse
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
   if original.returncode:
    if ours is not None:raise RuntimeError('Existing custom file requires review: '+path)
    pending[path]=incoming;continue
   if ours is None:raise RuntimeError('Local source file missing: '+path)
   if path=='services/api/server.js':
    added=b"import {handleFlutterwaveWebhook} from './flutterwaveWebhook.js';\n"
    incoming=incoming.replace(added,b'',1)
    if added not in ours:ours=added+ours
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
