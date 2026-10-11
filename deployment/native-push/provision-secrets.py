#!/usr/bin/env python3
import argparse,json,secrets,os
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--service-account',required=True);p.add_argument('--env',action='append',required=True);args=p.parse_args()
service=json.loads(Path(args.service_account).read_text())
if service.get('type')!='service_account' or not service.get('private_key','').startswith('-----BEGIN PRIVATE KEY-----') or not service.get('client_email') or not service.get('project_id'):raise SystemExit('Valid Firebase service-account credentials required')
files=[Path(f) for f in args.env]
# Reuse the canonical server secret; never print it.
canonical=files[0].read_text();existing=next((l.split('=',1)[1] for l in canonical.splitlines() if l.startswith('NATIVE_PUSH_HOOK_TOKEN=')),None)
token=existing if existing and len(existing)>=32 else secrets.token_hex(32)
for file in files:
 text=file.read_text();lines=[line for line in text.splitlines() if not line.startswith(('NATIVE_PUSH_HOOK_TOKEN=','NATIVE_PUSH_SERVICE_ACCOUNT_FILE='))]
 lines+=['NATIVE_PUSH_HOOK_TOKEN='+token,'NATIVE_PUSH_SERVICE_ACCOUNT_FILE=/run/olamide/native-push/service-account.json']
 file.write_text('\n'.join(lines)+'\n');os.chmod(file,0o600)
