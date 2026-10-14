#!/usr/bin/env python3
"""Authenticated HTTPS adapter for a local, commissioned FreeSWITCH instance."""
import argparse,hmac,json,os,pathlib,re,ssl,subprocess,threading,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from xml.etree import ElementTree as ET

LOCK=threading.Lock()
HOSTS={'us-east-va.sip.flowroute.com','us-west-or.sip.flowroute.com'}
def validate(c):
    if not isinstance(c,dict):raise ValueError('Trunk required')
    if c.get('host') not in HOSTS or c.get('port')!=5060 or c.get('transport')!='udp' or c.get('register') is not False:raise ValueError('Invalid carrier endpoint')
    mode=c.get('authenticationMode')
    if mode not in ('ip','digest') or not re.fullmatch(r'\d{8}',str(c.get('techPrefix',''))) or not re.fullmatch(r'\d{8}',str(c.get('sipUsername',''))):raise ValueError('Invalid identity')
    if not re.fullmatch(r'\+[1-9]\d{7,14}',str(c.get('callerId',''))):raise ValueError('Invalid caller ID')
    if type(c.get('configurationRevision')) is not int or c['configurationRevision']<1:raise ValueError('Invalid revision')
    password=c.get('sipPassword','')
    if mode=='digest' and (not isinstance(password,str) or not password or len(password)>256 or any(ord(x)<32 for x in password)):raise ValueError('Invalid digest password')
    if c.get('defaultOutbound')!='flowroute' or c.get('fallback') is not False:raise ValueError('Invalid routing policy')
    if c.get('destinationFormat')!=('techPrefix*E164' if mode=='ip' else 'E164'):raise ValueError('Invalid destination format')
    return c

def xml_files(tenant,c):
    c=validate(c);name='olamide-flowroute-'+tenant
    root=ET.Element('include');gateway=ET.SubElement(root,'gateway',name=name)
    values={'proxy':c['host']+':5060','register':'false','username':c['sipUsername'],'register-transport':'udp','caller-id-in-from':'true'}
    if c['authenticationMode']=='digest':values['password']=c['sipPassword']
    for k,v in values.items():ET.SubElement(gateway,'param',name=k,value=v)
    dial=ET.Element('include');context=ET.SubElement(dial,'context',name='olamide-carrier-'+tenant)
    extension=ET.SubElement(context,'extension',name='authorized-flowroute')
    cond=ET.SubElement(extension,'condition',field='${olamide_tenant_id}',expression='^'+tenant+'$')
    cond=ET.SubElement(extension,'condition',field='${olamide_pstn_authorized}',expression='^true$')
    cond=ET.SubElement(extension,'condition',field='destination_number',expression=r'^\+?([1-9][0-9]{7,14})$')
    ET.SubElement(cond,'action',application='set',data='effective_caller_id_number='+c['callerId'])
    destination=c['techPrefix']+'*$1' if c['authenticationMode']=='ip' else '$1'
    ET.SubElement(cond,'action',application='bridge',data='sofia/gateway/'+name+'/'+destination)
    # No fallback carrier or unauthenticated default-context route is added.
    return ET.tostring(root),ET.tostring(dial)

def atomic(path,data):
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_bytes(data);temp.chmod(0o600);temp.replace(path)

class Adapter:
    def __init__(self,config):self.config=config
    def cli(self,command):
        r=subprocess.run([self.config['fs_cli'],'-x',command],capture_output=True,text=True,timeout=3,check=True)
        if '-ERR' in r.stdout and ' killgw ' in command and ('Invalid Gateway' in r.stdout or 'No such gateway' in r.stdout):return r.stdout
        if '-ERR' in r.stdout or not r.stdout.strip():raise RuntimeError('Switch command failed')
        return r.stdout
    def health(self):
        if 'UP' not in self.cli('status'):raise RuntimeError('Switch unavailable')
    def handle(self,b):
        tenant=str(uuid.UUID(b['tenantId']))
        if tenant!=self.config['tenantId'] or b.get('provider')!='flowroute':raise ValueError('Tenant/provider unavailable')
        action=b.get('action');self.health()
        if action=='health':return {'status':'healthy'}
        if action=='verify':
            if not self.config.get('routingCommissioned'):raise ValueError('Commission authenticated billing route first')
            return {'status':'verified'}
        if action not in ('activate','deactivate'):raise ValueError('Unsupported action')
        if not self.config.get('routingCommissioned'):raise ValueError('Commission authenticated billing route first')
        gw=pathlib.Path(self.config['gatewayDir'])/('olamide-'+tenant+'.xml')
        dial=pathlib.Path(self.config['dialplanDir'])/('olamide-'+tenant+'.xml')
        paths=[gw,dial];old=[p.read_bytes() if p.exists() else None for p in paths]
        try:
            if action=='activate':
                c=validate(b.get('flowrouteTrunk'));data=xml_files(tenant,c)
                for p,value in zip(paths,data):
                    atomic(p,value);os.chown(p,0,p.parent.stat().st_gid);p.chmod(0o640)
            else:
                for p in paths:p.unlink(missing_ok=True)
            self.cli('reloadxml')
            self.cli('sofia profile '+self.config['profile']+' killgw olamide-flowroute-'+tenant)
            self.cli('sofia profile '+self.config['profile']+' rescan')
            if action=='activate':
                status=self.cli('sofia status gateway olamide-flowroute-'+tenant)
                if c['host'] not in status:raise RuntimeError('Gateway not loaded')
                return {'status':'active','configurationRevision':c['configurationRevision'],'authenticationMode':c['authenticationMode'],'defaultOutbound':'flowroute'}
            return {'status':'inactive'}
        except Exception:
            for p,value in zip(paths,old):
                if value is None:p.unlink(missing_ok=True)
                else:
                    atomic(p,value);os.chown(p,0,p.parent.stat().st_gid);p.chmod(0o640)
            self.cli('reloadxml');self.cli('sofia profile '+self.config['profile']+' killgw olamide-flowroute-'+tenant);self.cli('sofia profile '+self.config['profile']+' rescan')
            raise

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        cfg=self.server.adapter.config
        if self.path!='/provision':return self.reply(404,{'error':'Unavailable'})
        if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+cfg['token']):return self.reply(401,{'error':'Unauthorized'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=32768:raise ValueError('Invalid request size')
            self.connection.settimeout(5)
            body=json.loads(self.rfile.read(length))
            with LOCK:result=self.server.adapter.handle(body)
            self.reply(200,result)
        except Exception:self.reply(409,{'error':'Adapter operation failed; check switch and commissioning configuration'})
    def reply(self,status,body):
        raw=json.dumps(body).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)

def main():
    p=argparse.ArgumentParser();p.add_argument('--config',required=True);args=p.parse_args();cfg=json.loads(pathlib.Path(args.config).read_text())
    uuid.UUID(cfg['tenantId'])
    if len(cfg['token'])<32:raise ValueError('Invalid private configuration')
    if cfg.get('backend')!='kamailio' and not re.fullmatch(r'[a-zA-Z0-9_-]+',cfg['profile']):raise ValueError('Invalid profile')
    server=ThreadingHTTPServer((cfg.get('bind','0.0.0.0'),cfg.get('port',18443)),Handler);server.adapter=Adapter(cfg)
    if cfg.get('backend')=='kamailio':
        from kamailio import KamailioAdapter
        server.adapter=KamailioAdapter(cfg)
    ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.minimum_version=ssl.TLSVersion.TLSv1_2;ctx.load_cert_chain(cfg['certificate'],cfg['privateKey']);server.socket=ctx.wrap_socket(server.socket,server_side=True);server.serve_forever()
if __name__=='__main__':main()
