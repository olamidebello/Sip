#!/usr/bin/env python3
"""Configure browser push without displaying keys or requiring Firebase."""
import argparse, json, os, re, secrets, subprocess
from pathlib import Path

def configure(repo, email):
    if not re.fullmatch(r'[^\s@]+@[^\s@]+', email):
        raise SystemExit('A notification contact email is required')
    directory=Path('/etc/olamide/native-push')
    directory.mkdir(parents=True,exist_ok=True)
    os.chown(directory,0,1000)
    directory.chmod(0o750)
    config_path=directory/'web-push.json'
    if config_path.exists():
        config=json.loads(config_path.read_text())
        if not all(config.get(key) for key in ('publicKey','privateKey','subject')):
            raise SystemExit('Existing Web Push configuration is invalid; preserved without modification')
    else:
        result=subprocess.run(['docker','exec','docker-api-1','node','-e',
            "const c=require('crypto').createECDH('prime256v1');c.generateKeys();console.log(JSON.stringify({publicKey:c.getPublicKey().toString('base64url'),privateKey:Buffer.from(c.getPrivateKey().toString('hex').padStart(64,'0'),'hex').toString('base64url')}))"],capture_output=True,text=True,check=True)
        config=json.loads(result.stdout)
        config['subject']='mailto:'+email
        fd=os.open(config_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o640)
        with os.fdopen(fd,'w') as stream:
            json.dump(config,stream)
    os.chown(config_path,0,1000)
    config_path.chmod(0o640)
    env_paths=[Path('/etc/olamide/secrets.env'),repo/'deployment/docker/.env']
    envs={p:p.read_text() for p in env_paths if p.exists()}
    if repo/'deployment/docker/.env' not in envs:
        raise SystemExit('Compose environment file missing')
    token=None
    for text in envs.values():
        match=re.search(r'^NATIVE_PUSH_HOOK_TOKEN=([A-Za-z0-9_-]{32,})$',text,re.M)
        if match:
            if token and token!=match[1]:
                raise SystemExit('Push tokens disagree between environments; synchronize before continuing')
            token=match[1]
    token=token or secrets.token_hex(32)
    for path,text in envs.items():
        backup=path.with_name(path.name+'.before-web-push')
        if not backup.exists():
            backup.write_text(text);backup.chmod(0o600)
        lines=[line for line in text.splitlines() if not line.startswith(('WEB_PUSH_CONFIG_FILE=','NATIVE_PUSH_HOOK_TOKEN='))]
        path.write_text('\n'.join(lines)+f'\nWEB_PUSH_CONFIG_FILE=/run/olamide/native-push/web-push.json\nNATIVE_PUSH_HOOK_TOKEN={token}\n')
        path.chmod(0o600)
    compose=repo/'deployment/docker/compose.yml'
    text=compose.read_text()
    if '      WEB_PUSH_CONFIG_FILE:' not in text:
        anchor='      NATIVE_PUSH_HOOK_TOKEN: ${NATIVE_PUSH_HOOK_TOKEN:-}'
        if text.count(anchor)!=1:
            raise SystemExit('Unexpected Compose push configuration; existing routing preserved')
        backup=compose.with_name('compose.yml.before-web-push')
        if not backup.exists():backup.write_text(text)
        compose.write_text(text.replace(anchor,anchor+'\n      WEB_PUSH_CONFIG_FILE: ${WEB_PUSH_CONFIG_FILE:-}'))
    print('Browser push keys and private environment configured. No keys displayed.')
    print('Rebuild/recreate the API and web containers to activate.')

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--repo',type=Path,default=Path('/opt/olamide/repo'))
    parser.add_argument('--email',required=True)
    args=parser.parse_args()
    configure(args.repo,args.email)
