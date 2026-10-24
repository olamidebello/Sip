#!/usr/bin/env python3
"""Root-local token setup. Prints no secrets and retains existing application tokens."""
import argparse,json,os,re,secrets,tempfile
from pathlib import Path

def write(path,text):
    fd,tmp=tempfile.mkstemp(dir=path.parent)
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,'w') as out:out.write(text)
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

if __name__=='__main__':
    if os.geteuid()!=0:raise SystemExit('Root required')
    parser=argparse.ArgumentParser();parser.add_argument('--env',required=True);parser.add_argument('--apps',nargs='+',required=True);args=parser.parse_args()
    if any(not re.fullmatch('[a-z][a-z0-9-]{1,39}',x) for x in args.apps):raise SystemExit('Invalid application ID')
    env=Path(args.env);text=env.read_text();matches=re.findall(r'^HOSTED_APP_TOKENS_JSON=(.*)$',text,re.M)
    if len(matches)>1:raise SystemExit('Duplicate environment key; inspect privately')
    raw=matches[0] if matches else '{}'
    if raw.startswith("'") and raw.endswith("'"):raw=raw[1:-1]
    values=json.loads(raw or '{}')
    if not isinstance(values,dict):raise SystemExit('Invalid existing token map')
    for app in args.apps:
        if app in values and (not isinstance(values[app],str) or not re.fullmatch('[A-Za-z0-9_-]{32,128}',values[app])):raise SystemExit('Existing token requires private operator review')
        values.setdefault(app,secrets.token_urlsafe(40))
    line="HOSTED_APP_TOKENS_JSON='"+json.dumps(values,separators=(',',':'))+"'"
    text=re.sub(r'^HOSTED_APP_TOKENS_JSON=.*$',lambda _:line,text,flags=re.M) if matches else text.rstrip()+'\n'+line+'\n'
    directory=Path('/etc/olamide/hosted-apps');directory.mkdir(mode=0o700,parents=True,exist_ok=True);os.chmod(directory,0o700)
    # Backup once before setting a new integration environment.
    backup=env.with_name(env.name+'.before-hosted-apps')
    if not backup.exists():write(backup,env.read_text())
    write(env,text)
    for app in args.apps:
        target=directory/(app+'.json')
        config=json.loads(target.read_text()) if target.exists() else {'app_id':app,'database':'/var/lib/'+app+'/communications.sqlite'}
        config['token']=values[app]
        write(target,json.dumps(config,indent=2)+'\n')
