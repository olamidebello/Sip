from pathlib import Path
root=Path('/opt/olamide/repo')
updates={}
p=root/'services/api/pstnBilling.js'
s=p.read_text()
old='destination=normalizeDestination(data.destination,policies);'
new='destination=normalizeDestination(await profileDestination(db,actor.tenant_id,actor.user_id,data.destination),policies);'
if new not in s:
    if s.count(old)!=1: raise RuntimeError('Unexpected PSTN integration; no files written')
    s="import {profileDestination} from './localDialing.js';\n"+s.replace(old,new)
updates[p]=s
p=root/'services/api/callAccess.js'
s=p.read_text()
old="  if(local.rowCount && !/^\\+?[1-9][0-9]{6,14}$/.test(address.username))return {allowed:false,error:'This SIP user is unavailable'};"
new="  if(local.rowCount && /^\\+?\\d{3,20}$/.test(address.username)) {\n    try {\n      const number=String(await profileDestination(pool,user.tenant_id,user.id,address.username)).replace(/^\\+/,'');\n      if(!/^[1-9]\\d{7,14}$/.test(number))return {allowed:false,error:'Enter a complete phone number'};\n      if(!await activeSubscription(pool,user))return {allowed:false,error:'An active subscription is required for external calls',configurationUrl:'/#billing'};\n      return {allowed:true,scope:'external',target:`sip:+${number}@${address.domain}`};\n    }catch(error){return {allowed:false,error:error.message};}\n  }\n  if(local.rowCount && !/^\\+?[1-9][0-9]{6,14}$/.test(address.username))return {allowed:false,error:'This SIP user is unavailable'};"
if new not in s:
    if s.count(old)!=1: raise RuntimeError('Unexpected call access integration; no files written')
    s="import {profileDestination} from './localDialing.js';\n"+s.replace(old,new)
updates[p]=s
for p,s in updates.items():p.write_text(s)
