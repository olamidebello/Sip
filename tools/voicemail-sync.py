#!/usr/bin/env python3
"""Compile private Asterisk mailboxes from the application database."""
import fcntl,grp,hashlib,json,os,re,secrets,subprocess,sys
from pathlib import Path
UUID=re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
CONFIG=Path('/etc/olamide/voicemail')
STATE=Path('/var/lib/olamide/voicemail')
BINARY='/opt/olamide/asterisk-22.11.0/sbin/asterisk'
COMPOSE=['docker','compose','--project-directory','/opt/olamide/repo/deployment/docker','exec','-T','api','node','/app/voicemailExport.mjs']

def run(args,body=None):
    r=subprocess.run(args,input=body,text=True,capture_output=True,timeout=90)
    if r.returncode or 'No such command' in r.stdout:raise RuntimeError('Voicemail synchronization command failed: '+Path(args[0]).name)
    return r.stdout

def compile_config(rows,pins):
    if not isinstance(rows,list) or len(rows)>50000:raise ValueError('Invalid mailbox export')
    contexts={};extensions=['[general]','static=yes','writeprotect=yes','','[olamide-voicemail]','exten => s,1,Hangup(21)']
    seen=set()
    for row in rows:
        box=row.get('mailbox_id','');tenant=row.get('tenant_id','');seconds=row.get('max_seconds');revision=row.get('revision')
        if not UUID.fullmatch(box) or not UUID.fullmatch(tenant) or box in seen or type(seconds) is not int or not 30<=seconds<=180 or type(revision) is not int or revision<1 or row.get('enabled') not in (0,1,False,True):raise ValueError('Invalid mailbox configuration')
        seen.add(box)
        if not row['enabled']:continue
        pin=pins.setdefault(box,str(secrets.randbelow(900000000000)+100000000000))
        if not re.fullmatch(r'[0-9]{12}',pin):raise ValueError('Invalid stored mailbox secret')
        context='tenant-'+tenant
        # Names never become dialplan/config syntax. No email delivery or arbitrary dialout contexts.
        name=re.sub(r'[^a-zA-Z0-9 ._-]',' ',str(row.get('display_name') or 'User'))[:80].strip() or 'User'
        contexts.setdefault(context,[]).append(f'{box} => -{pin},{name},,,maxsecs={seconds}|maxmsg=50|review=yes|operator=no|sendvoicemail=no')
        extensions += [f'exten => {box},1,Answer()', ' same => n,Wait(1)',f' same => n,VoiceMail({box}@{context},u)',' same => n,Hangup()',f'exten => check-{box},1,Answer()', ' same => n,Wait(1)',f' same => n,VoiceMailMain({box}@{context},s)',' same => n,Hangup()']
    vm=['[general]','format=wav','maxmsg=50','maxsecs=120','minsecs=2','maxsilence=10','silencethreshold=128','maxdeletedmsg=0','review=yes','operator=no','sendvoicemail=no','envelope=yes','saycid=yes','usedirectory=no','moveheard=yes']
    for context,boxes in sorted(contexts.items()):vm+=['',f'[{context}]',*sorted(boxes)]
    return '\n'.join(vm)+'\n','\n'.join(extensions)+'\n'

def ensure_default_greetings(rows,sound,spool,uid,gid):
    if not sound.is_file():raise RuntimeError('Default unavailable greeting is missing')
    audio=sound.read_bytes()
    if not audio.startswith(b'RIFF') or audio[8:12]!=b'WAVE':raise ValueError('Invalid default greeting audio')
    for row in rows:
        if not row['enabled']:continue
        box=row['mailbox_id'];tenant=row['tenant_id']
        if not UUID.fullmatch(box) or not UUID.fullmatch(tenant):raise ValueError('Invalid greeting identity')
        tenant_folder=spool/('tenant-'+tenant)
        tenant_folder.mkdir(parents=True,exist_ok=True,mode=0o770)
        if tenant_folder.resolve()!=tenant_folder.absolute():raise ValueError('Symlinked tenant mailbox path refused')
        tenant_folder.chmod(0o770);os.chown(tenant_folder,uid,gid)
        folder=tenant_folder/box
        folder.mkdir(exist_ok=True,mode=0o770)
        if folder.resolve()!=folder.absolute():raise ValueError('Symlinked mailbox path refused')
        folder.chmod(0o770);os.chown(folder,uid,gid)
        # Exclusive creation preserves personal recordings and existing message files.
        try:
            with (folder/'unavail.wav').open('xb') as out:out.write(audio)
        except FileExistsError:continue
        (folder/'unavail.wav').chmod(0o640);os.chown(folder/'unavail.wav',uid,gid)

def atomic(path,content,mode=0o640,gid=None):
    p=path.with_name(path.name+'.new');p.write_text(content);p.chmod(mode)
    if gid is not None:os.chown(p,0,gid)
    p.replace(path)

def main():
    STATE.mkdir(parents=True,exist_ok=True)
    with (STATE/'sync.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        rows=json.loads(run(COMPOSE))
        pinfile=STATE/'pins.json';pins=json.loads(pinfile.read_text()) if pinfile.exists() else {}
        vm,ext=compile_config(rows,pins);gid=grp.getgrnam('olamidevm').gr_gid
        import pwd
        sound=Path('/opt/olamide/asterisk-22.11.0/var/lib/asterisk/sounds/en/olamide-user-unavailable.wav')
        if sound.is_file():ensure_default_greetings(rows,sound,STATE/'spool/voicemail',pwd.getpwnam('olamidevm').pw_uid,gid)
        atomic(pinfile,json.dumps(pins),0o600)
        digest=hashlib.sha256((vm+ext).encode()).hexdigest();stamp=STATE/'applied.sha256'
        changed=not stamp.exists() or stamp.read_text()!=digest or not (CONFIG/'voicemail.conf').exists() or not (CONFIG/'extensions.conf').exists()
        if not changed:changed=(CONFIG/'voicemail.conf').read_text()!=vm or (CONFIG/'extensions.conf').read_text()!=ext
        if changed:
            atomic(CONFIG/'voicemail.conf',vm,gid=gid);atomic(CONFIG/'extensions.conf',ext,gid=gid)
            run([BINARY,'-C',str(CONFIG/'asterisk.conf'),'-rx','dialplan reload'])
            run([BINARY,'-C',str(CONFIG/'asterisk.conf'),'-rx','voicemail reload'])
        output=run([BINARY,'-C',str(CONFIG/'asterisk.conf'),'-rx','module show like app_voicemail.so'])
        if 'app_voicemail.so' not in output or '1 modules loaded' not in output:raise RuntimeError('Recorder voicemail module not ready')
        users=run([BINARY,'-C',str(CONFIG/'asterisk.conf'),'-rx','voicemail show users'])
        dialplan=run([BINARY,'-C',str(CONFIG/'asterisk.conf'),'-rx','dialplan show olamide-voicemail'])
        for row in rows:
            if row['enabled'] and (row['mailbox_id'] not in users or 'check-'+row['mailbox_id'] not in dialplan):raise RuntimeError('Mailbox not loaded')
        ack=[{'mailbox_id':r['mailbox_id'],'revision':r['revision']} for r in rows if r.get('applied_revision')!=r['revision']]
        if ack:run(COMPOSE+['--ack'],json.dumps(ack))
        atomic(stamp,digest,0o600)
        print('Voicemail recorder synchronized.')
if __name__=='__main__':
    try:main()
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
