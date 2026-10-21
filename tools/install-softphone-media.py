from pathlib import Path
root=Path('/opt/olamide/repo');changes=[]
p=root/'services/api/server.js';s=p.read_text()
if '// OLAMIDE_SOFTPHONE_ICE_V1' not in s:
 anchor='      if (path === "/api/meetings/config" && req.method === "GET")'
 if s.count(anchor)!=1:raise SystemExit('Unknown ICE API layout; source unchanged')
 s=s.replace(anchor,'''      // OLAMIDE_SOFTPHONE_ICE_V1
      if(path==='/api/softphone/media-config'&&req.method==='GET'){
        res.setHeader('Cache-Control','no-store');
        return send(res,200,{iceServers:[...meetingIceServers,...(turnSecret?[turnIceServer({secret:turnSecret,host:turnHost,userId:user.id})]:[])]});
      }
'''+anchor)
changes.append((p,s))
p=root/'apps/web/src/main.js';s=p.read_text()
if '// OLAMIDE_SOFTPHONE_ICE_V1' not in s:
 anchor='  const candidate = new SimpleUser(server, {'
 option='      transportOptions:{server,keepAliveInterval:30,keepAliveDebounce:10},'
 if s.count(anchor)!=1 or s.count(option)!=1:raise SystemExit('Unknown SIP options layout; source unchanged')
 s="import {softphoneMediaOptions} from './softphoneMedia.js';\n"+s
 s=s.replace(anchor,"  // OLAMIDE_SOFTPHONE_ICE_V1\n  const mediaOptions=softphoneMediaOptions(await apiGet('/api/softphone/media-config'));\n  if(!current())return;\n  const refreshMedia=setInterval(async()=>{if(!current()){clearInterval(refreshMedia);return;}try{const next=softphoneMediaOptions(await apiGet('/api/softphone/media-config'));if(current())mediaOptions.peerConnectionConfiguration.iceServers=next.peerConnectionConfiguration.iceServers;}catch{}},20*60*1000);\n"+anchor)
 s=s.replace(option,'      sessionDescriptionHandlerFactoryOptions:mediaOptions,\n'+option)
changes.append((p,s))
for p,s in changes:p.write_text(s)
