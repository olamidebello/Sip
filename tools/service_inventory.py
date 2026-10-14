#!/usr/bin/env python3
"""Publish sanitized same-host readiness; process checks never imply call acceptance."""
import argparse, datetime, json, pathlib, socket, subprocess

SERVICES = [('kamailio','SIP edge','kamailio',8088),('rtpengine','Media relay','rtpengine-daemon',None),('pbx','Asterisk PBX','olamide-pbx',5062),('postfix','SMTP','postfix',587),('dovecot','IMAP','dovecot',993),('rspamd','Email filtering','rspamd',None)]
CAPABILITIES = ['sip','routing','provisioning','commissioning','termination','full_services']

def collect(host):
    result=[]
    for key,name,unit,port in SERVICES:
        active=False
        if unit:
            active=subprocess.run(['systemctl','is-active','--quiet',unit],capture_output=True).returncode==0
        connected=False
        if port:
            try:
                # Kamailio may bind only its private Docker bridge.
                endpoint=host if key=='kamailio' else '127.0.0.1'
                with socket.create_connection((endpoint,port),timeout=2): connected=True
            except OSError: pass
        result.append({'id':key,'name':name,'active':active,'transportConnected':connected,'capabilities':{cap:'pending' for cap in CAPABILITIES},'reason':'Live SIP, routing, provisioning and call acceptance required'})
    return {'schemaVersion':1,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'services':result}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--bridge-ip',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
    output=pathlib.Path(args.output);tmp=output.with_suffix('.tmp');tmp.write_text(json.dumps(collect(args.bridge_ip)));tmp.chmod(0o644);tmp.replace(output)
