from pathlib import Path
import sys
p=Path(sys.argv[1] if len(sys.argv)>1 else '/opt/olamide/repo/apps/web/src/main.js')
s=p.read_text();lines=[l for l in s.splitlines() if l.startswith('setupVoicemailUi(')]
if len(lines)!=1:raise SystemExit('Expected one voicemail setup call; no files changed')
old=lines[0];new=old.replace('document,get:apiGet','document,show:showWorkspace,get:apiGet').replace('()=>!!accountUser',"()=>['user','admin','super_admin'].includes(activeRole)").replace("()=>accountUser?.role==='super_admin'","()=>activeRole==='super_admin'")
if 'accountUser' in new or 'activeRole' not in new:raise SystemExit('Unexpected voicemail role wiring; no files changed')
p.write_text(s.replace(old,new))
print('Voicemail menu role wiring repaired.')
