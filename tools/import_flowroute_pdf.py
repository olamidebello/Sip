#!/usr/bin/env python3
"""Import a private Flowroute registration PDF without printing credentials."""
import argparse,json,pathlib,re,subprocess,sys

def extract(text):
    m=re.search(r'Username\s*&\s*Auth Username\s+(\d{8})\s*\n([^\n]+)\nPassword',text)
    if not m:raise ValueError('Expected Flowroute registration username/password fields')
    password=m[2].strip()
    if not password or len(password)>256 or password in ('Reset Password','Password'):raise ValueError('Missing SIP password')
    return {'sipUsername':m[1],'techPrefix':m[1],'sipPassword':password}

def main():
    a=argparse.ArgumentParser();a.add_argument('--pdf',required=True);a.add_argument('--tenant-id');a.add_argument('--caller-id',default='');a.add_argument('--ip-allowed',action='store_true');args=a.parse_args()
    import pdfplumber
    source=pathlib.Path(args.pdf)
    with pdfplumber.open(source) as pdf:text='\n'.join(page.extract_text() or '' for page in pdf.pages)
    config={**extract(text),'authenticationMode':'ip','pop':'US-East-VA','publicIp':'154.29.77.102','allowedIpConfirmed':args.ip_allowed,'callerId':args.caller_id,'maxConcurrentCalls':500}
    cmd=['docker','compose','--env-file','/etc/olamide/secrets.env','run','--rm','--no-deps','-T','api','node','importFlowrouteTrunk.js']
    subprocess.run(cmd,cwd='/opt/olamide/repo/deployment/docker',input=json.dumps({'config':config,**({'tenantId':args.tenant_id} if args.tenant_id else {})}).encode(),check=True)
if __name__=='__main__':
    try:main()
    except Exception:sys.exit('Flowroute PDF import failed; credentials were not printed.')
