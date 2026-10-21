from pathlib import Path
root=Path('/opt/olamide/repo')
changes=[]
for name,imp,anchor,wire in [
 ('services/api/server.js',"import {handleLiveCalls} from './liveCalls.js';\n","      if(path==='/api/voicemail'","      if(path==='/api/admin/live-calls')return await handleLiveCalls({req,res,user,pool,send});\n"),
 ('apps/web/src/main.js',"import {setupLiveCallsUi} from './liveCallsUi.js';\n",'setupVoicemailUi({document,',"setupLiveCallsUi({document,get:apiGet,isSuper:()=>activeRole==='super_admin',show:showWorkspace});\n")]:
 p=root/name;s=p.read_text()
 if imp not in s:
  if s.count(anchor)!=1:raise SystemExit('Expected unique integration anchor: '+name)
  s=imp+s.replace(anchor,wire+anchor,1)
 elif wire not in s:raise SystemExit('Partial live monitoring integration: '+name)
 changes.append((p,s))
for p,s in changes:p.write_text(s)
