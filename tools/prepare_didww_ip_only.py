#!/usr/bin/env python3
"""Reconcile an already approved DIDWW IP-only trunk; never print secrets."""
import argparse,ipaddress,json,os,pathlib,re,shlex,tempfile,urllib.request,uuid
HOSTS={'nyc.us.out.didww.com','lac.us.out.didww.com','mia.us.out.didww.com','fra.eu.out.didww.com','ams.eu.out.didww.com','sg.out.didww.com','hk.out.didww.com'}
API='https://api.didww.com/v3/voice_out_trunks/'
def reconcile(attributes,public_ip):
    ip=ipaddress.ip_address(public_ip)
    if not ip.is_global:raise ValueError('Public egress IP required')
    auth=attributes.get('authentication_method',{})
    if auth.get('type')!='ip_only':raise ValueError('DIDWW must approve and activate IP-Only authentication first; no authentication downgrade attempted')
    aa=dict(auth.get('attributes',{}))
    if aa.get('tech_prefix'):raise ValueError('Remove the DIDWW Tech Prefix before commissioning')
    if attributes.get('status')!='active' or attributes.get('threshold_reached'):raise ValueError('DIDWW trunk inactive or spending threshold reached')
    def add(values):
        values=list(values or [])
        for v in values:
            net=ipaddress.ip_network(v,strict=False)
            if net.prefixlen==0:raise ValueError('Remove unrestricted provider IP allowlists before commissioning')
        if str(ip) not in values:values.append(str(ip))
        return values
    aa['allowed_sip_ips']=add(aa.get('allowed_sip_ips'))
    return {'authentication_method':{'type':'ip_only','attributes':aa},'allowed_rtp_ips':add(attributes.get('allowed_rtp_ips')),'on_cli_mismatch_action':'send_original_cli'}
def request(trunk,key,method='GET',attrs=None):
    body=None if attrs is None else json.dumps({'data':{'type':'voice_out_trunks','id':trunk,'attributes':attrs}}).encode()
    req=urllib.request.Request(API+trunk,data=body,method=method,headers={'Api-Key':key,'Accept':'application/vnd.api+json','Content-Type':'application/vnd.api+json'})
    # No redirects: an API key must never be forwarded to a different host.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    with urllib.request.build_opener(NoRedirect).open(req,timeout=25) as response:
        return json.load(response)['data']['attributes']
def atomic(path,value):
    path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    fd,temp=tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd,'w') as out:json.dump(value,out);out.flush();os.fsync(out.fileno())
        os.chmod(temp,0o600);os.replace(temp,path)
    finally:
        if os.path.exists(temp):os.unlink(temp)
def run(config,apply=False):
    trunk=str(uuid.UUID(config['trunkId']));tenant=str(uuid.UUID(config['tenantId']))
    if config.get('cliRightsConfirmed') is not True or not config.get('approvalReference'):raise ValueError('CLI rights confirmation and DIDWW approval reference required')
    if config.get('host') not in HOSTS:raise ValueError('Documented DIDWW regional host required')
    capacity=config.get('maxConcurrentCalls')
    if not isinstance(capacity,int) or isinstance(capacity,bool) or not 1<=capacity<=500:raise ValueError('Capacity 1–500 required')
    assignments=config.get('assignments')
    if not isinstance(assignments,list) or not assignments:raise ValueError('Verified user/DID assignments required')
    for a in assignments:
        uuid.UUID(a['userId'])
        if a.get('provider')!='didww' or a.get('authorized') is not True or not a.get('evidence') or not re.fullmatch(r'\+[1-9][0-9]{7,14}',a.get('number','')):raise ValueError('Verified DIDWW assignments required')
    key=config.get('apiKey') or os.environ.get('DIDWW_API_KEY')
    if not key:
        for line in pathlib.Path('/etc/olamide/secrets.env').read_text().splitlines():
            if line.startswith('DIDWW_API_KEY='):
                parts=shlex.split(line.split('=',1)[1]);key=parts[0] if len(parts)==1 else None
    if not key:raise ValueError('Configure production DIDWW_API_KEY in /etc/olamide/secrets.env')
    original=request(trunk,key);desired=reconcile(original,config['publicIp'])
    provider_capacity=original.get('capacity_limit')
    if provider_capacity and capacity>int(provider_capacity):raise ValueError('Requested capacity exceeds provider trunk limit')
    target=pathlib.Path('/var/lib/olamide/service-inventory/outbound-dids.json')
    policy=json.loads(target.read_text()) if target.exists() else {'version':1,'tenants':{}}
    tenant_config=policy.setdefault('tenants',{}).setdefault(tenant,{'assignments':[]})
    selected={a['userId'] for a in assignments}
    tenant_config['assignments']=[a for a in tenant_config['assignments'] if a['userId'] not in selected]+assignments
    tenant_config['didww']={'host':config['host'],'maxConcurrentCalls':capacity,'ipOnlyApproved':True,'allowedIpConfirmed':True,'cliAuthorized':True}
    seen_users=set();seen_numbers=set()
    for tid,tc in policy['tenants'].items():
        uuid.UUID(tid)
        for assignment in tc['assignments']:
            uid=str(uuid.UUID(assignment['userId']));number=assignment.get('number','')
            if (tid,uid) in seen_users or number in seen_numbers or not re.fullmatch(r'\+[1-9][0-9]{7,14}',number) or assignment.get('authorized') is not True or not assignment.get('evidence') or assignment.get('provider') not in ('flowroute','didww'):raise ValueError('Existing or merged policy contains invalid or duplicate assignments')
            seen_users.add((tid,uid));seen_numbers.add(number)
    import socket
    socket.getaddrinfo(config['host'],5060,type=socket.SOCK_DGRAM)
    # Full application validation is repeated before local routing cutover.
    if not apply:return
    backup=pathlib.Path('/etc/olamide/didww-prerequisites-backups')
    backup.mkdir(mode=0o700,exist_ok=True)
    import time
    atomic(backup/(trunk+'-'+str(time.time_ns())+'.json'),{'data':{'type':'voice_out_trunks','id':trunk,'attributes':{k:original.get(k) for k in desired}}})
    if any(original.get(k)!=v for k,v in desired.items()):request(trunk,key,'PATCH',desired)
    verified=request(trunk,key)
    if any(verified.get(k)!=v for k,v in desired.items()):raise ValueError('DIDWW did not acknowledge exact prerequisite settings')
    atomic('/etc/olamide/didww-outbound-dids.json',policy)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--config',default='/etc/olamide/didww-ip-only.json');parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    try:run(json.loads(pathlib.Path(args.config).read_text()),args.apply)
    except ValueError as e:raise SystemExit(str(e))
    except Exception:raise SystemExit('DIDWW prerequisite preparation failed; inspect local credentials/connectivity. No secrets printed. Provider settings may need review if the API update succeeded but verification failed.')
    print('DIDWW IP-only prerequisites verified'+(' and private assignment policy prepared' if args.apply else '; no changes made'))
