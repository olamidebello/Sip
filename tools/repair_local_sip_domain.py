#!/usr/bin/env python3
"""Backed-up local subscriber repair. No carrier configuration or passwords printed."""
import argparse,datetime,os,pathlib,re,subprocess,shutil,gzip,time,urllib.request,urllib.error,shlex,urllib.parse

def replace_domain(text,old,new):
    values=re.findall(r'^SIP_ACCOUNT_DOMAIN=(.*)$',text,re.M)
    if len(values)>1 or (values and values[0] not in ('',old,new)):
        raise ValueError('Unexpected configured domain; no configuration changed')
    if values:return re.sub(r'^SIP_ACCOUNT_DOMAIN=.*$', 'SIP_ACCOUNT_DOMAIN='+new,text,flags=re.M)
    return text.rstrip()+'\nSIP_ACCOUNT_DOMAIN='+new+'\n'

def configured_application_host(text):
    # compose.yml sets PUBLIC_ORIGIN to https://${DOMAIN}; it does not read
    # PUBLIC_ORIGIN from the host environment file.
    values=re.findall(r'^\s*DOMAIN\s*=(.*)$',text,re.M)
    if len(values)!=1:raise ValueError('Exactly one Compose DOMAIN setting required')
    tokens=shlex.split(values[0],comments=True,posix=True)
    if len(tokens)!=1:raise ValueError('Valid Compose DOMAIN setting required')
    value=tokens[0]
    if not re.fullmatch(r'[a-zA-Z0-9.-]+(?::443)?',value):raise ValueError('Literal HTTPS application domain required')
    origin=urllib.parse.urlsplit('https://'+value)
    return origin.hostname

def local_mode_environment(text):
    values=re.findall(r'^SIP_PROVISION_MODE=(.*)$',text,re.M)
    if len(values)>1:raise ValueError('Duplicate SIP provisioning mode; no configuration changed')
    if values:return re.sub(r'^SIP_PROVISION_MODE=.*$', 'SIP_PROVISION_MODE=kamailio_local',text,flags=re.M)
    return text.rstrip()+'\nSIP_PROVISION_MODE=kamailio_local\n'

def repair_command(compose,source,target,apply=False):
    # A new one-off container reads the canonical Compose configuration.
    # docker compose exec would retain the running container's stale environment.
    return compose+['run','--rm','--no-deps','-T','-e','SIP_PROVISION_MODE=kamailio_local','-e','SIP_REPAIR_FROM='+source,'-e','SIP_ACCOUNT_DOMAIN='+target,'api','node','repairSipDomain.js']+(['--apply'] if apply else [])

def main():
    args=argparse.ArgumentParser();args.add_argument('--from-domain',required=True);args.add_argument('--to-domain',required=True);args.add_argument('--apply',action='store_true');args.add_argument('--refresh-local-auth',action='store_true');a=args.parse_args()
    if os.geteuid()!=0:raise SystemExit('Root required')
    for domain in (a.from_domain,a.to_domain):
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}[a-zA-Z0-9]',domain):raise SystemExit('Valid DNS domains required')
    canonical=pathlib.Path('/etc/olamide/secrets.env');saved=pathlib.Path('/opt/olamide/repo/deployment/docker/.env');cwd='/opt/olamide/repo/deployment/docker'
    text=canonical.read_text()
    if not re.search(r'^SIP_PROVISION_MODE=kamailio_local$',text,re.M):raise SystemExit('Existing local provisioning mode required; no mode was changed')
    origin=configured_application_host(text)
    if origin!=a.to_domain.lower():raise SystemExit('Target must match Compose DOMAIN host: '+origin)
    paths=[canonical]+([saved] if saved.exists() and saved.resolve()!=canonical.resolve() else [])
    updates=[(path,local_mode_environment(replace_domain(path.read_text(),a.from_domain,a.to_domain)))for path in paths]
    compose=['docker','compose','--env-file',str(canonical)]
    def probe(apply=False):
        subprocess.run(repair_command(compose,a.from_domain,a.to_domain,apply),cwd=cwd,check=True)
    def refresh(apply=False):
        subprocess.run(compose+['run','--rm','--no-deps','-T','-e','SIP_PROVISION_MODE=kamailio_local','-e','SIP_ACCOUNT_DOMAIN='+a.to_domain,'api','node','refreshSipAuth.js']+(['--apply'] if apply else []),cwd=cwd,check=True)
    probe()
    if a.refresh_local_auth:refresh()
    if not a.apply:return
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');backup=pathlib.Path('/opt/olamide/backups/sip-domain-'+stamp);backup.mkdir(mode=0o700,parents=True)
    for index,(path,_)in enumerate(updates):shutil.copy2(path,backup/('config-'+str(index)+'.env'));(backup/('config-'+str(index)+'.env')).chmod(0o600)
    with gzip.open(backup/'database.sql.gz','wb')as output:
        dump=subprocess.Popen(compose+['exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --single-transaction --hex-blob -u root "$MYSQL_DATABASE"'],cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        shutil.copyfileobj(dump.stdout,output)
        if dump.wait()!=0:raise SystemExit('Database backup failed; repair not applied')
    # Repair commits atomically; account statuses and encrypted passwords remain unchanged.
    subprocess.run(compose+['stop','api'],cwd=cwd,check=True)
    try:
        probe(True)
        if a.refresh_local_auth:refresh(True)
        for path,content in updates:
            tmp=path.with_name(path.name+'.sip-domain.tmp');tmp.write_text(content);tmp.chmod(0o600);tmp.replace(path)
    finally:
        subprocess.run(compose+['up','-d','--no-deps','api'],cwd=cwd,check=True)
    deadline=time.monotonic()+60
    while True:
        try:
            with urllib.request.urlopen('https://'+a.to_domain+'/api/health',timeout=5)as response:
                if response.status==200:break
        except (urllib.error.URLError,TimeoutError):pass
        if time.monotonic()>=deadline:raise SystemExit('API health did not recover; domain repair is committed, see private backups')
        time.sleep(2)
    subprocess.run(compose+['exec','-T','api','node','sipLiveCheck.js'],cwd=cwd,check=True)
    print('Domain repair and authenticated REGISTER passed. Sign out and sign in again on clients.')
if __name__=='__main__':main()
