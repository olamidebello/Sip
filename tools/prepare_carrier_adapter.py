#!/usr/bin/env python3
"""Create a stable server-side adapter token and matching private API input."""
import json,os,pathlib,secrets,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'services/carrier-adapter'))
from adapter import atomic

def main():
    if os.geteuid()!=0:raise ValueError('Root required')
    settings=json.load(sys.stdin);path=pathlib.Path('/etc/olamide/carrier-adapter.json')
    old=json.loads(path.read_text()) if path.exists() else {}
    if old and old['tenantId']!=settings['tenantId']:raise ValueError('Existing tenant cannot be replaced')
    settings['token']=old.get('token') or secrets.token_urlsafe(48)
    atomic(path,json.dumps(settings).encode())
    atomic(pathlib.Path('/root/carrier-adapter.json'),json.dumps({'tenantId':settings['tenantId'],'targetKey':'primary','url':settings['url'],'token':settings['token'],'provider':'flowroute','name':'Primary carrier adapter','region':'primary','maxConcurrentCalls':500}).encode())
if __name__=='__main__':
    try:main()
    except Exception:sys.exit('Private adapter preparation failed; no secrets printed')
