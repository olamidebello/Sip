#!/usr/bin/env python3
"""Authenticated HTTPS transport for the Kamailio carrier adapter."""
import argparse,hmac,json,pathlib,re,ssl,threading,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

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

def atomic(path,data):
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_bytes(data);temp.chmod(0o600);temp.replace(path)

class Adapter:
    def __init__(self,config):self.config=config
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
    if cfg.get('backend')!='kamailio':raise ValueError('Kamailio backend required')
    from kamailio import KamailioAdapter
    server=ThreadingHTTPServer((cfg.get('bind','0.0.0.0'),cfg.get('port',18443)),Handler);server.adapter=KamailioAdapter(cfg)
    ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.minimum_version=ssl.TLSVersion.TLSv1_2;ctx.load_cert_chain(cfg['certificate'],cfg['privateKey']);server.socket=ctx.wrap_socket(server.socket,server_side=True);server.serve_forever()
if __name__=='__main__':main()
