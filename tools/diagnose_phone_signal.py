from pathlib import Path
import re
folders=list(Path('/opt/olamide/backups').glob('phone-signal-*'))
if not folders:raise SystemExit('PHONE_SIGNAL_CHECK no_backup=true')
p=max(folders,key=lambda p:p.stat().st_mtime);log=p/'deploy.log';s=log.read_text(errors='replace') if log.exists() else ''
print('PHONE_SIGNAL_CHECK backup='+p.name)
codes=re.findall(r'PHONE_SIGNAL_PATCH step=([1-4])',s)
for code in sorted(set(codes)):print('PHONE_SIGNAL_CHECK patch_step='+code)
for pattern,code in [('SyntaxError','javascript_syntax'),('failed to solve','image_build'),('unrecognized directive','caddy_configuration'),('curl:','health_check'),('No such file or directory','missing_file'),('ReferenceError','javascript_reference')]:
 if pattern in s:print('PHONE_SIGNAL_CHECK error='+code)
if not codes and not any(x in s for x in ['SyntaxError','failed to solve','unrecognized directive','curl:','No such file or directory','ReferenceError']):print('PHONE_SIGNAL_CHECK error=unclassified')

# Emit only recognized repository filenames, never raw build output or paths.
known = {'main.js','phoneSignal.js','phoneSignal.css','smsConversations.js',
         'smsConversations.css','smsAppearance.js','smsTools.js','smsComposer.js',
         'package.json','package-lock.json','index.html','Caddyfile','web.Dockerfile'}
for line in s.splitlines():
    if not re.search(r'ENOENT|No such file|Could not resolve|failed to read|not found|Cannot find', line, re.I):
        continue
    for name in sorted(known):
        if re.search(r'(?<![A-Za-z0-9_.-])'+re.escape(name)+r'(?![A-Za-z0-9_.-])',line):
            print('PHONE_SIGNAL_CHECK missing_reference='+name)
root=Path('/opt/olamide/repo')
for name in sorted(known):
    relative = ('deployment/docker/'+name if name in {'Caddyfile','web.Dockerfile'} else
                'apps/web/'+name if name in {'package.json','package-lock.json','index.html'} else
                'apps/web/src/'+name)
    if not (root/relative).is_file():
        print('PHONE_SIGNAL_CHECK absent_now='+name)
