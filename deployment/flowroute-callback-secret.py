#!/usr/bin/env python3
"""Preserve callback identity across both environment files and saved container configuration."""
from pathlib import Path
import json,os,re,secrets,shlex,subprocess

def main():
    paths=[Path('/etc/olamide/secrets.env'),Path('/opt/olamide/repo/deployment/docker/.env')]
    values={}
    texts={p:p.read_text() for p in paths}
    keys=['FLOWROUTE_WEBHOOK_TOKEN','FLOWROUTE_WEBHOOK_TENANT_ID']
    for text in texts.values():
        for key in keys:
            for raw in re.findall(r'^'+key+r'=(.*)$',text,re.M):
                parts=shlex.split(raw);value=parts[0] if parts else ''
                if value:values.setdefault(key,set()).add(value)
    result=subprocess.run(['docker','inspect','docker-api-1','--format','{{json .Config.Env}}'],capture_output=True,text=True,check=True)
    for item in json.loads(result.stdout):
        key,_,value=item.partition('=')
        if key in keys and value:values.setdefault(key,set()).add(value)
    if any(len(v)>1 for v in values.values()):raise SystemExit('Conflicting saved callback settings; no changes made')
    token=next(iter(values.get(keys[0],[])),secrets.token_hex(32))
    if not re.fullmatch('[a-zA-Z0-9_-]{32,256}',token):raise SystemExit('Invalid saved callback token; no changes made')
    tenant=next(iter(values.get(keys[1],[])),'00000000-0000-4000-8000-000000000000')
    if not re.fullmatch('[a-f0-9-]{36}',tenant):raise SystemExit('Invalid saved carrier workspace')
    for p,text in texts.items():
        for key,value in zip(keys,[token,tenant]):
            if re.search(r'^'+key+'=',text,re.M):text=re.sub(r'^'+key+r'=.*$',key+'='+value,text,flags=re.M)
            else:text+='\n'+key+'='+value+'\n'
        tmp=p.with_name(p.name+'.flowroute-tmp');tmp.write_text(text);os.chmod(tmp,0o600);tmp.replace(p)
    override=Path('/etc/olamide/compose.flowroute-inbound.yml')
    override.write_text('services:\n  api:\n    environment:\n      FLOWROUTE_WEBHOOK_TOKEN: "'+token+'"\n      FLOWROUTE_WEBHOOK_TENANT_ID: "'+tenant+'"\n')
    override.chmod(0o600)
    print('Preserved private callback settings')
if __name__=='__main__':main()
