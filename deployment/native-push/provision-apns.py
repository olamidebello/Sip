#!/usr/bin/env python3
"""Package an authorized Apple APNs key and synchronize private runtime configuration."""
import argparse,json,os,re,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--key',required=True);p.add_argument('--team',required=True);p.add_argument('--key-id',required=True);p.add_argument('--environment',choices=['sandbox','production'],required=True);p.add_argument('--output',required=True);p.add_argument('--env',action='append',required=True);a=p.parse_args()
if not all(re.fullmatch('[A-Z0-9]{10}',v) for v in [a.team,a.key_id]):raise SystemExit('Valid authorized Apple team and key ID required')
key=Path(a.key).read_text()
# Verify an actual P-256 private key, without writing or printing it.
r=subprocess.run(['openssl','pkey','-text','-noout'],input=key,text=True,capture_output=True)
if r.returncode or 'prime256v1' not in r.stdout:raise SystemExit('A valid APNs P-256 private key is required')
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f:json.dump({'teamId':a.team,'keyId':a.key_id,'bundleId':'com.dobhrap.olamide','environment':a.environment,'privateKey':key},f)
os.chmod(out,0o640)
for name in a.env:
 file=Path(name);lines=[l for l in file.read_text().splitlines() if not l.startswith('NATIVE_PUSH_APNS_CONFIG_FILE=')];lines.append('NATIVE_PUSH_APNS_CONFIG_FILE=/run/olamide/native-push/apns.json');file.write_text('\n'.join(lines)+'\n');os.chmod(file,0o600)
