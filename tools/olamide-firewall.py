#!/usr/bin/env python3
"""Dedicated-host SIP firewall. Owns only inet/olamide_guard, never Docker tables."""
import argparse,configparser,fcntl,ipaddress,json,os,re,secrets,shutil,subprocess,sys,time
from pathlib import Path
ETC=Path('/etc/olamide/firewall');STATE=Path('/var/lib/olamide/firewall');BACKUPS=Path('/opt/olamide/backups')
TABLE='olamide_guard';SELF='/usr/local/sbin/olamide-firewall'
TRUSTED_CARRIERS=['34.210.91.112/28','34.226.36.32/28','16.163.86.112/30','3.0.5.12/30','3.8.37.20/30','3.71.103.56/30','18.228.70.48/30']
SYSCTLS={'net.ipv4.tcp_syncookies':'1','net.ipv4.tcp_rfc1337':'1','net.ipv4.conf.all.accept_source_route':'0','net.ipv4.conf.default.accept_source_route':'0','net.ipv4.conf.all.accept_redirects':'0','net.ipv4.conf.default.accept_redirects':'0','net.ipv4.conf.all.send_redirects':'0','net.ipv4.conf.default.send_redirects':'0','net.ipv6.conf.all.accept_source_route':'-1','net.ipv6.conf.default.accept_source_route':'-1','net.ipv6.conf.all.accept_redirects':'0','net.ipv6.conf.default.accept_redirects':'0','net.ipv4.icmp_echo_ignore_broadcasts':'1','net.ipv4.icmp_ignore_bogus_error_responses':'1'}

def run(args,check=True,body=None):
    r=subprocess.run(args,input=body,text=True,capture_output=True,timeout=90)
    if check and r.returncode:raise RuntimeError('Command failed: '+args[0]+' '+args[1]+' (details retained locally; no secrets displayed)')
    return r

def write(path,body,mode=0o600):
    path.parent.mkdir(parents=True,exist_ok=True);p=path.with_name(path.name+'.new');p.write_text(body);p.chmod(mode);p.replace(path)

def port(value):
    value=int(value)
    if not 1<=value<=65535:raise ValueError('Port outside 1–65535')
    return value

def option(args,name,short=None):
    result=None
    for i,arg in enumerate(args):
        if arg.startswith('--'+name+'='):result=arg.split('=',1)[1]
        elif short and arg.startswith(short) and len(arg)>len(short):result=arg[len(short):]
        elif arg=='--'+name or short and arg==short:
            if i+1>=len(args):raise ValueError('Missing network option')
            result=args[i+1]
    return result

def processes(name):
    found=[]
    for p in Path('/proc').glob('[0-9]*'):
        try:
            if (p/'comm').read_text().strip()==name:found.append((p,(p/'cmdline').read_bytes().decode().rstrip('\0').split('\0')))
        except (FileNotFoundError,PermissionError,ProcessLookupError):pass
    return found

def rtp_ranges(args,config_text):
    cfg=configparser.ConfigParser(interpolation=None,strict=False,inline_comment_prefixes=('#',))
    if config_text:cfg.read_string(config_text)
    section=option(args,'config-section') or 'rtpengine'
    base=dict(cfg[section]) if cfg.has_section(section) else {}
    low=port(option(args,'port-min','-m') or base.get('port-min',30000));high=port(option(args,'port-max','-M') or base.get('port-max',40000))
    ranges=[(low,high)]
    prefix=option(args,'interfaces-config') or base.get('interfaces-config')
    if prefix:
        for name in cfg.sections():
            if name.startswith(prefix+'-') and not cfg[name].get('alias'):
                ranges.append((port(cfg[name].get('port-min',low)),port(cfg[name].get('port-max',high))))
    if any(a<10000 or a>b or b-a>40000 for a,b in ranges):raise ValueError('Unexpected RTP range; review before applying')
    return sorted(set(ranges))

def turn_ports(args,text):
    cfg={}
    for line in text.splitlines():
        line=line.split('#',1)[0].strip()
        if line:
            key,_,value=line.partition('=');cfg[key.strip()]=value.strip() or 'true'
    def val(key,default=None):return option(args,key) or cfg.get(key,default)
    def disabled(key):return '--'+key in args or str(cfg.get(key,'false')).lower() in ('true','1','yes')
    low=val('min-port');high=val('max-port')
    if not low or not high:raise ValueError('Active TURN has no explicit relay range; configure its min-port/max-port first')
    low,high=port(low),port(high)
    if low<10000 or low>high or high-low>20000:raise ValueError('Unexpected TURN relay range')
    tcp=[(low,high)];udp=[(low,high)];listen=port(val('listening-port',3478));tls=port(val('tls-listening-port',5349))
    if not disabled('no-tcp'):tcp.append((listen,listen))
    if not disabled('no-udp'):udp.append((listen,listen))
    if not disabled('no-tls'):tcp.append((tls,tls))
    if not disabled('no-dtls'):udp.append((tls,tls))
    return tcp,udp

def process_config(proc,args,name,default):
    value=option(args,name,'-c' if name=='config' else None) or default
    if value=='none':return ''
    path=Path(value)
    if not path.is_absolute():raise ValueError('Relative daemon configuration is not supported; review firewall ports')
    target=proc/'root'/str(path).lstrip('/')
    if not target.exists():return ''
    return target.read_text()

def sip_ports(text):
    tcp=set();udp=set();internal=set()
    for line in text.splitlines():
        line=line.strip()
        if line.startswith('#'):continue
        m=re.match(r'listen\s*=\s*(udp|tcp|tls|sctp):(.+?):([0-9]+)(?:\s|$)',line)
        if not m:continue
        proto,address,number=m.groups();number=port(number);address=address.strip('[]')
        try:
            ip=ipaddress.ip_address(address)
            if ip.is_loopback:continue
            if ip.is_private and not ip.is_unspecified:
                internal.add((proto,number));continue
        except ValueError:raise ValueError('A Kamailio listener uses an unresolved interface/macro; review it before enabling the firewall')
        if proto=='udp':udp.add(number)
        elif proto in ('tcp','tls'):tcp.add(number)
        else:raise ValueError('SCTP listener requires an explicitly reviewed firewall rule')
    if not tcp and not udp:raise ValueError('No public SIP listener detected')
    if any(number!=8088 for _,number in internal):raise ValueError('Unknown private SIP listener; review before enabling firewall')
    return sorted(tcp),sorted(udp)

def discover():
    for service in ['ufw','firewalld']:
        if service=='ufw' and shutil.which('ufw') and 'Status: inactive' in run(['ufw','status'],False).stdout:continue
        if run(['systemctl','is-active','--quiet',service],False).returncode==0:raise RuntimeError('Existing '+service+' is active; refusing to replace or conflict with its policy')
    links=json.loads(run(['ip','-j','link','show']).stdout)
    if any(x.get('linkinfo',{}).get('info_kind') in ('wireguard','tun','vxlan','gre','gretap','ipip') for x in links):raise RuntimeError('Active tunnel interface detected; forwarding policy needs explicit review')
    for line in run(['docker','network','ls','--format','{{json .}}']).stdout.splitlines():
        if json.loads(line).get('Driver') not in ('bridge','host','null'):raise RuntimeError('Non-bridge Docker networking requires review before firewall activation')
    ssh={port(line.split()[1]) for line in run(['/usr/sbin/sshd','-T']).stdout.splitlines() if line.startswith('port ')}
    session=os.environ.get('SSH_CONNECTION','').split()
    if len(session)!=4:raise RuntimeError('Run installation from your SSH session so rollback confirmation can verify a new connection')
    ipaddress.ip_address(session[0]);ssh.add(port(session[3]))
    tcp,udp=sip_ports(Path('/etc/kamailio/kamailio.cfg').read_text())
    rtp=[];daemons=processes('rtpengine')
    if not daemons:raise RuntimeError('RTPengine must be running before its media ports can be preserved')
    for proc,args in daemons:rtp+=rtp_ranges(args,process_config(proc,args,'config-file','/etc/rtpengine/rtpengine.conf'))
    turn_tcp=[];turn_udp=[]
    for proc,args in processes('turnserver'):
        a,b=turn_ports(args,process_config(proc,args,'config','/etc/turnserver.conf'));turn_tcp+=a;turn_udp+=b
    return {'ssh':sorted(ssh),'sip_tcp':tcp,'sip_udp':udp,'rtp':sorted(set(rtp)),'turn_tcp':sorted(set(turn_tcp)),'turn_udp':sorted(set(turn_udp)),'session':' '.join(session)}

def elements(values):
    merged=[]
    for a,b in sorted(set((v,v) if isinstance(v,int) else tuple(v) for v in values)):
        if merged and a<=merged[-1][1]+1:merged[-1]=(merged[-1][0],max(b,merged[-1][1]))
        else:merged.append((a,b))
    return ', '.join(str(a) if a==b else str(a)+'-'+str(b) for a,b in merged)

def render(p):
    def ports(name,values):return f' set {name} {{ type inet_service; flags interval; elements = {{ {elements(values)} }}; }}\n' if values else ''
    s='table inet '+TABLE+' {\n'
    for name,values in [('ssh_ports',p['ssh']),('sip_tcp',p['sip_tcp']),('sip_udp',p['sip_udp']),('media',p['rtp']),('turn_tcp',p['turn_tcp']),('turn_udp',p['turn_udp'])]:s+=ports(name,values)
    s+=' set carriers4 { type ipv4_addr; flags interval; elements = { '+', '.join(TRUSTED_CARRIERS)+' }; }\n'
    for name,typ in [('ssh4','ipv4_addr'),('ssh6','ipv6_addr'),('sip4','ipv4_addr'),('sip6','ipv6_addr'),('web4','ipv4_addr'),('web6','ipv6_addr')]:s+=f' set {name} {{ type {typ}; flags dynamic,timeout; timeout 60s; size 65536; }}\n'
    s+=''' chain web_syn {
  ct state new tcp flags & (syn|ack) == syn meta nfproto ipv4 update @web4 { ip saddr limit rate over 100/second burst 200 packets } counter drop
  ct state new tcp flags & (syn|ack) == syn meta nfproto ipv6 update @web6 { ip6 saddr limit rate over 100/second burst 200 packets } counter drop
  return
 }
 chain input {
  type filter hook input priority -10; policy drop;
  iifname "lo" accept
  ct state invalid counter drop
  ip saddr 127.0.0.0/8 counter drop
  ip6 saddr ::1 counter drop
  ct state new tcp dport @ssh_ports meta nfproto ipv4 update @ssh4 { ip saddr limit rate over 30/minute burst 60 packets } counter drop
  ct state new tcp dport @ssh_ports meta nfproto ipv6 update @ssh6 { ip6 saddr limit rate over 30/minute burst 60 packets } counter drop
'''
    if p['sip_udp']:
        s+='''  ip saddr @carriers4 udp dport @sip_udp accept
  udp dport @sip_udp meta nfproto ipv4 update @sip4 { ip saddr limit rate over 200/second burst 400 packets } counter drop
  udp dport @sip_udp meta nfproto ipv6 update @sip6 { ip6 saddr limit rate over 200/second burst 400 packets } counter drop
'''
    s+='''  ct state established,related accept
  tcp dport @ssh_ports accept
  tcp dport { 80,443 } jump web_syn
  tcp dport { 80,443 } accept
  udp dport 443 accept
  iifname "docker0" tcp dport 8088 accept
  iifname "br-*" tcp dport 8088 accept
  udp sport 67 udp dport 68 accept
  ip6 saddr fe80::/10 udp sport 547 udp dport 546 accept
  ip protocol icmp icmp type { destination-unreachable,time-exceeded,parameter-problem } accept
  meta l4proto ipv6-icmp icmpv6 type { destination-unreachable,packet-too-big,time-exceeded,parameter-problem,nd-router-solicit,nd-router-advert,nd-neighbor-solicit,nd-neighbor-advert,mld-listener-query,mld-listener-report,mld-listener-done,mld2-listener-report } accept
  ip protocol icmp icmp type echo-request limit rate 10/second burst 20 packets accept
  meta l4proto ipv6-icmp icmpv6 type echo-request limit rate 10/second burst 20 packets accept
'''
    for proto,name,values in [('tcp','sip_tcp',p['sip_tcp']),('udp','sip_udp',p['sip_udp']),('udp','media',p['rtp']),('tcp','turn_tcp',p['turn_tcp']),('udp','turn_udp',p['turn_udp'])]:
        if values:
            if name=='sip_tcp':s+='  tcp dport @sip_tcp jump web_syn\n'
            s+=f'  {proto} dport @{name} accept\n'
    s+='''  limit rate 5/minute burst 10 packets log prefix "OLAMIDE_FW_INPUT "
  counter drop comment "deny other host ingress"
 }
 chain forward {
  type filter hook forward priority -10; policy accept;
  ct state invalid counter drop
  ct state established,related accept
  iifname "lo" accept
  iifname "docker0" accept
  iifname "br-*" accept
  ct status dnat meta l4proto tcp ct original proto-dst { 80,443 } jump web_syn
  ct status dnat meta l4proto tcp ct original proto-dst { 80,443 } accept
  ct status dnat meta l4proto udp ct original proto-dst 443 accept
  limit rate 5/minute burst 10 packets log prefix "OLAMIDE_FW_FORWARD "
  counter drop comment "deny other external container ingress and forwarding"
 }
}
'''
    return s

def table_exists():return run(['nft','list','table','inet',TABLE],False).returncode==0

def load_rules(rules,check=False):
    batch=('delete table inet '+TABLE+'\n' if table_exists() else '')+rules
    args=['nft']+(['-c'] if check else [])+['-f','-'];run(args,body=batch)

def health():
    run(['systemctl','is-active','--quiet','kamailio'])
    run(['curl','--fail','--silent','--show-error','--max-time','15','https://sip.dobhrap.com/api/health'])
    result=run(['curl','--silent','--show-error','--max-time','15','-o','/dev/null','-w','%{http_code}','-H','Origin: https://sip.dobhrap.com','https://sip.dobhrap.com/ws'])
    if result.stdout.strip() not in ('400','426'):raise RuntimeError('WebSocket upstream check failed; refusing to commit a policy that could block calling')

def pending():
    path=STATE/'pending.json'
    return json.loads(path.read_text()) if path.exists() else None

def stage_ssh(data):
    jail='[sshd]\nenabled = true\nfilter = sshd\nbackend = systemd\nport = '+','.join(map(str,data['policy']['ssh']))+'\nmaxretry = 6\nfindtime = 10m\nbantime = 1h\nbantime.increment = true\nbantime.maxtime = 1d\nbanaction = nftables-multiport\nignoreip = 127.0.0.1/8 ::1\n'
    write(Path('/etc/fail2ban/jail.d/olamide-sshd.local'),jail)
    run(['fail2ban-client','-t'])
    run(['systemctl','unmask','--runtime','fail2ban.service'],False)
    run(['systemctl','enable','--now','fail2ban.service'])
    run(['fail2ban-client','reload','--restart','sshd'])
    run(['fail2ban-client','status','sshd'])

def apply():
    if pending():raise RuntimeError('A firewall change is already awaiting confirmation; use status or rollback first')
    policy=discover();health();rules=render(policy);load_rules(rules,True)
    backup=BACKUPS/('firewall-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+secrets.token_hex(3));backup.mkdir(parents=True,mode=0o700)
    prior=run(['nft','list','table','inet',TABLE],False)
    write(backup/'previous.nft',prior.stdout if prior.returncode==0 else '')
    write(backup/'ruleset.json',run(['nft','-j','list','ruleset']).stdout)
    write(backup/'candidate.nft',rules);write(backup/'policy.json',json.dumps({k:v for k,v in policy.items() if k!='session'},indent=2))
    paths=[ETC/'approved.nft',Path('/etc/sysctl.d/70-olamide-network-security.conf'),Path('/etc/fail2ban/jail.d/olamide-sshd.local')]
    persistent={str(path):path.read_text() if path.exists() else None for path in paths}
    old_sysctls={}
    for key in SYSCTLS:
        result=run(['sysctl','-n',key],False)
        if result.returncode==0:old_sysctls[key]=result.stdout.strip()
    data={'persistent':persistent,'sysctls':old_sysctls,'service_enabled':run(['systemctl','is-enabled','--quiet','olamide-firewall.service'],False).returncode==0,'fail2ban_active':run(['systemctl','is-active','--quiet','fail2ban.service'],False).returncode==0,'fail2ban_enabled':run(['systemctl','is-enabled','--quiet','fail2ban.service'],False).returncode==0,'token':secrets.token_hex(16),'backup':str(backup),'session':policy.pop('session'),'started':time.time(),'policy':policy}
    write(STATE/'pending.json',json.dumps(data));write(ETC/'candidate.nft',rules)
    try:
        run(['systemd-run','--collect','--unit=olamide-firewall-rollback','--on-active=10m','--timer-property=AccuracySec=1s',SELF,'rollback','--token',data['token']])
        run(['systemctl','enable','olamide-firewall.service'])
        load_rules(rules);stage_ssh(data);health()
    except Exception:
        rollback(data['token']);raise
    print('Firewall active temporarily. Automatic rollback in 10 minutes.')
    print('Open a NEW SSH connection, then run as root: olamide-firewall confirm')
    print('Backup: '+str(backup))

def rollback(token=None):
    data=pending()
    if not data:
        print('No pending firewall change.');return
    if token and token!=data['token']:return
    previous=(Path(data['backup'])/'previous.nft').read_text()
    if previous:load_rules(previous)
    elif table_exists():run(['nft','delete','table','inet',TABLE])
    for name,body in data.get('persistent',{}).items():
        if body is None:Path(name).unlink(missing_ok=True)
        else:write(Path(name),body)
    for key,value in data.get('sysctls',{}).items():run(['sysctl','-q','-w',key+'='+value],False)
    if not data.get('service_enabled'):run(['systemctl','disable','olamide-firewall.service'],False)
    if data.get('fail2ban_active'):run(['fail2ban-client','reload'],False)
    else:run(['systemctl','stop','fail2ban.service'],False)
    run(['systemctl','enable' if data.get('fail2ban_enabled') else 'disable','fail2ban.service'],False)
    (STATE/'pending.json').unlink();run(['systemctl','stop','olamide-firewall-rollback.timer'],False)
    print('Previous firewall table restored; Docker and other firewall tables were preserved.')

def confirm():
    data=pending()
    if not data:raise RuntimeError('No firewall change is awaiting confirmation')
    session=os.environ.get('SSH_CONNECTION','').split()
    if len(session)!=4 or ' '.join(session)==data['session']:raise RuntimeError('Confirm from a NEW SSH connection, keeping the original one open')
    if port(session[3]) not in data['policy']['ssh']:raise RuntimeError('This SSH listening port is not in the reviewed policy')
    health()
    if not table_exists():raise RuntimeError('Candidate firewall is no longer active')
    write(ETC/'approved.nft',(ETC/'candidate.nft').read_text())
    run(['systemctl','enable','olamide-firewall.service'])
    # Only commit persistent changes after the new SSH connection succeeded.
    write(Path('/etc/sysctl.d/70-olamide-network-security.conf'),'\n'.join(k+' = '+v for k,v in SYSCTLS.items() if k in data['sysctls'])+'\n',0o644)
    for key,value in SYSCTLS.items():
        if key in data['sysctls']:run(['sysctl','-q','-w',key+'='+value])
    run(['fail2ban-client','status','sshd'])
    health()
    (STATE/'pending.json').unlink();run(['systemctl','stop','olamide-firewall-rollback.timer'],False)
    write(STATE/'status.json',json.dumps({'confirmed_at':time.time(),'backup':data['backup'],'policy':data['policy']},indent=2))
    print('Firewall confirmed and persistent. SSH brute-force protection enabled.')

def boot():
    if pending():rollback()
    if (ETC/'approved.nft').exists():load_rules((ETC/'approved.nft').read_text())

def main():
    if os.geteuid()!=0:raise RuntimeError('Run as root or with sudo')
    p=argparse.ArgumentParser();p.add_argument('action',choices=['plan','apply','confirm','rollback','status','boot']);p.add_argument('--token');args=p.parse_args()
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700);ETC.mkdir(parents=True,exist_ok=True,mode=0o700)
    with Path('/run/olamide-firewall.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if args.action=='plan':
            data=discover();data.pop('session');print(json.dumps(data,indent=2))
        elif args.action=='apply':apply()
        elif args.action=='confirm':
            try:confirm()
            except Exception:
                # A same-session attempt changes nothing and keeps its timer armed.
                data=pending()
                if data and len(os.environ.get('SSH_CONNECTION','').split())==4 and os.environ.get('SSH_CONNECTION','')!=data['session']:rollback(data['token'])
                raise
        elif args.action=='rollback':rollback(args.token)
        elif args.action=='boot':boot()
        else:
            data=pending();print(json.dumps({'active':table_exists(),'pending_confirmation':bool(data),'rollback_seconds_remaining':max(0,round(600-(time.time()-data['started']))) if data else None},indent=2))
if __name__=='__main__':
    try:main()
    except Exception as e:print('Firewall: '+str(e),file=sys.stderr);sys.exit(1)
