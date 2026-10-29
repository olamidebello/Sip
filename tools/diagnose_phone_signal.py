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
# Use the controller's public source catalog to recognize other missing modules.
catalog=Path(__file__).resolve().parents[1]/'apps/web'
public_names={f.name for folder in [catalog/'src',catalog/'public'] for f in folder.rglob('*') if f.is_file() and f.suffix in {'.js','.css','.html','.json','.svg','.png'}}
for line in s.splitlines():
    if not re.search(r'ENOENT|No such file|Could not resolve|failed to read|not found|Cannot find|Could not load',line,re.I):continue
    for name in sorted(public_names-known):
        if re.search(r'(?<![A-Za-z0-9_.-])'+re.escape(name)+r'(?![A-Za-z0-9_.-])',line):
            print('PHONE_SIGNAL_CHECK build_reference='+name)
main=root/'apps/web/src/main.js'
if main.is_file():
    source=main.read_text(errors='replace')
    for relative in re.findall(r'''(?:from\s*|import\s*)['"](\./[^'"\n]+)['"]''',source):
        name=Path(relative).name
        if name in public_names and not (main.parent/relative).is_file():
            print('PHONE_SIGNAL_CHECK unresolved_import='+name)
# Distinguish runtime/build filesystem problems from frontend module resolution.
for marker,code in [('esbuild','esbuild'),('node_modules','node_modules'),('/bin/sh','build_shell'),('npm ERR!','npm'),('ENOSPC','disk_full'),('Could not load','module_load'),('Could not resolve','module_resolution')]:
    if marker in s:print('PHONE_SIGNAL_CHECK build_context='+code)
