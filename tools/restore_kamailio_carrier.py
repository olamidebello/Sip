#!/usr/bin/env python3
"""Restore the existing private carrier assignment after a Kamailio restart."""
import json,pathlib,subprocess,sys,uuid
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'services/carrier-adapter'))
from adapter import validate

def restore(check=False):
    config=json.loads(pathlib.Path('/etc/olamide/carrier-adapter.json').read_text())
    tenant=str(uuid.UUID(config['tenantId']))
    state=pathlib.Path(config['stateFile'])
    value=state.read_text() if state.exists() else ''
    if value:validate(json.loads(value))
    if check:return
    result=subprocess.run([config.get('kamcmd','/usr/sbin/kamcmd'),'-s',config['rpcSocket'],'htable.sets','olamide_carrier',tenant,value],capture_output=True,text=True,timeout=5,check=True)
    if result.stdout.strip().startswith('error:'):raise ValueError('RPC restoration failed')
if __name__=='__main__':
    try:restore('--check' in sys.argv)
    except Exception:raise SystemExit('Private carrier state restoration failed; inspect local configuration without sharing secrets')
