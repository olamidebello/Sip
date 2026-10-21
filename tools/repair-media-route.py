from pathlib import Path
p=Path('/opt/olamide/repo/services/api/server.js');s=p.read_text()
block='''      // OLAMIDE_SOFTPHONE_ICE_V1
      if(path==='/api/softphone/media-config'&&req.method==='GET'){
        res.setHeader('Cache-Control','no-store');
        return send(res,200,{iceServers:[...meetingIceServers,...(turnSecret?[turnIceServer({secret:turnSecret,host:turnHost,userId:user.id})]:[])]});
      }
'''
anchor="      if(path==='/api/softphone/access'||path==='/api/softphone/authorize')"
if s.count(block)!=1 or s.count(anchor)!=1:raise SystemExit('Expected media integration missing or changed; source unchanged')
s=s.replace(block,'').replace(anchor,block+anchor)
assert s.index("path==='/api/softphone/media-config'")<s.index('      if (path.startsWith("/api/softphone/"))')
p.write_text(s)
print('Media route now precedes the general softphone handler.')
