#!/usr/bin/env python3
"""Kamailio IP-authenticated Flowroute provisioning backend."""
import json,pathlib,subprocess,uuid
from adapter import Adapter,validate,atomic
class KamailioAdapter(Adapter):
    def rpc(self,*args):
        r=subprocess.run([self.config.get('kamcmd','/usr/sbin/kamcmd'),'-s',self.config['rpcSocket'],*args],capture_output=True,text=True,timeout=2,check=True)
        if r.stdout.strip().startswith('error:'):raise RuntimeError('RPC rejected')
        return r.stdout
    def health(self):self.rpc('core.uptime');self.rpc('htable.listTables')
    def handle(self,b):
        tenant=str(uuid.UUID(b['tenantId']))
        if tenant!=self.config['tenantId'] or b.get('provider')!='flowroute':raise ValueError('Tenant/provider unavailable')
        self.health();action=b.get('action')
        if action=='health':return {'status':'healthy','backend':'kamailio','routingCommissioned':bool(self.config.get('routingCommissioned'))}
        if not self.config.get('routingCommissioned'):raise ValueError('Authenticated paid route not commissioned')
        if action=='verify':return {'status':'verified'}
        if action not in ('activate','deactivate'):raise ValueError('Unsupported action')
        state=pathlib.Path(self.config['stateFile']);old=state.read_bytes() if state.exists() else b''
        if action=='activate':
            c=validate(b.get('flowrouteTrunk'))
            if c['authenticationMode']=='digest' and not self.config.get('digestCommissioned'):raise ValueError('Commission Flowroute digest outbound routing first')
            import ipaddress
            ipaddress.ip_address(c['publicIp'])
            value=json.dumps(c,separators=(',',':'))
        else:value=''
        try:
            self.rpc('htable.sets','olamide_carrier',tenant,value)
            actual=self.rpc('htable.get','olamide_carrier',tenant)
            if value and c['host'] not in actual:raise RuntimeError('Configuration not acknowledged')
            atomic(state,value.encode())
        except Exception:
            self.rpc('htable.sets','olamide_carrier',tenant,old.decode());raise
        if action=='deactivate':return {'status':'inactive'}
        return {'status':'active','configurationRevision':c['configurationRevision'],'authenticationMode':c['authenticationMode'],'defaultOutbound':'flowroute'}
