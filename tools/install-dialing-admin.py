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


p=root/'services/api/pstnBilling.js'
s=updates[p]
anchor='export async function migratePstnBilling(pool){'
if 'await migrateDialingPolicies(pool);' not in s:
    if s.count(anchor)!=1:raise RuntimeError('Unexpected migration integration; no files written')
    s="import {migrateDialingPolicies} from './dialingPolicy.js';\n"+s.replace(anchor,anchor+'\n await migrateDialingPolicies(pool);')
updates[p]=s
p=root/'services/api/server.js'
s=p.read_text()
route="if(path.startsWith('/api/admin/dialing-policy'))return await handleDialingPolicy({req,res,path,user,pool,send,readJson});"
if route not in s:
    anchor="if(path==='/api/softphone/access'||path==='/api/softphone/authorize')"
    if s.count(anchor)!=1:raise RuntimeError('Unexpected server routing integration; no files written')
    s="import {handleDialingPolicy} from './dialingPolicy.js';\n"+s.replace(anchor,route+'\n      '+anchor)
updates[p]=s
p=root/'apps/web/src/callerIdentityAdmin.js'
s=p.read_text()
call='const dialing=setupDialingAdmin({document,parent:panel,get,request,isSuper});'
if call not in s:
    anchor=' parent.prepend(panel);'
    clear='if(wasSuper&&!permitted){epoch++;'
    if s.count(anchor)!=1 or s.count(clear)!=1:raise RuntimeError('Unexpected admin UI integration; no files written')
    s="import {setupDialingAdmin} from './dialingAdmin.js';\n"+s.replace(anchor,' '+call+'\n'+anchor).replace(clear,'if(wasSuper&&!permitted){dialing.clear();epoch++;')
updates[p]=s
for p,s in updates.items():p.write_text(s)
