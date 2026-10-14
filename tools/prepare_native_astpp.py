#!/usr/bin/env python3
"""Create isolated native GUI credentials without rotating existing database keys."""
import json,os,pathlib,secrets,argparse

def prepare(path):
    path.mkdir(mode=0o700,parents=True,exist_ok=True);path.chmod(0o700)
    config=path/'config.json'
    if config.exists():
        c=json.loads(config.read_text())
        if c['baseUrl']!='http://localhost:8089/':raise ValueError('Unexpected native origin')
    else:
        c={'dbPassword':secrets.token_hex(32),'privateKey':secrets.token_hex(16),'sessionKey':secrets.token_hex(16),'operatorPassword':'Aa1!'+secrets.token_urlsafe(24),'baseUrl':'http://localhost:8089/'}
        config.write_text(json.dumps(c));config.chmod(0o600)
    env=path/'runtime.env'
    if not env.exists():env.write_text('NATIVE_DB_ROOT_PASSWORD='+secrets.token_hex(32)+'\nNATIVE_DB_PASSWORD='+c['dbPassword']+'\nNATIVE_STATE_DIR='+str(path)+'\n');env.chmod(0o600)
    operator=path/'operator.json'
    if not operator.exists():operator.write_text(json.dumps({'username':'admin','password':c['operatorPassword']}));operator.chmod(0o600)
    return c
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--directory',default='/etc/olamide/native-astpp');args=a.parse_args()
    if os.geteuid()!=0:raise SystemExit('Root required')
    prepare(pathlib.Path(args.directory));print('Private native ASTPP credentials prepared without rotation')
