#!/usr/bin/env python3
from pathlib import Path
import sys

def integrate(root):
 pending={}
 def change(name,marker,anchor,addition,after=False):
  p=root/name;s=pending.get(p,p.read_text())
  if marker in s:return
  if s.count(anchor)!=1:raise ValueError('Caller ID integration requires review: '+name)
  pending[p]=s.replace(anchor,anchor+addition if after else addition+anchor)
 def imp(name,line):
  p=root/name;s=pending.get(p,p.read_text())
  if line not in s:pending[p]=line+s
 imp('services/api/callerIdentityPolicy.js',"import {migrateUserCallerId,callerIdOverride} from './userCallerId.js';\n")
 change('services/api/callerIdentityPolicy.js','// USER_CALLER_ID_MIGRATE_V1','export async function migrateCallerIdentityPolicy(pool){','\n // USER_CALLER_ID_MIGRATE_V1\n await migrateUserCallerId(pool);',True)
 anchor=" if(setting.requireAssignedDid){const rented=await primary();if(rented)return rented;const result=assigned(policyLoader(),tenant,user);if(!result)throw Error('No authorized outbound DID assigned to this user');return result;}"
 replacement=""" // USER_CALLER_ID_RESOLVE_V1
 const override=await callerIdOverride(db,tenant,user);
 if(setting.requireAssignedDid){
  const rented=await primary();const staticIdentity=assigned(policyLoader(),tenant,user);
  if(override){if(rented?.callerId===override.callerId||staticIdentity?.callerId===override.callerId)return override;throw Error('Caller ID override must match an assigned outbound DID under current policy');}
  if(rented)return rented;if(staticIdentity)return staticIdentity;throw Error('No authorized outbound DID assigned to this user');
 }
 if(override)return override;
"""
 p=root/'services/api/callerIdentityPolicy.js';s=pending.get(p,p.read_text())
 if '// USER_CALLER_ID_RESOLVE_V1' not in s:
  if s.count(anchor)!=1:raise ValueError('Caller identity resolver requires review')
  pending[p]=s.replace(anchor,replacement)
 imp('services/api/server.js',"import {handleUserCallerId} from './userCallerId.js';\n")
 change('services/api/server.js','// USER_CALLER_ID_HTTP_V1',"      if(path==='/api/softphone/access'","      // USER_CALLER_ID_HTTP_V1\n      if(path==='/api/admin/user-caller-id')return await handleUserCallerId({req,res,user,pool,send,readJson});\n")
 imp('apps/web/src/main.js',"import {setupUserCallerIdAdmin} from './userCallerIdAdmin.js';\n")
 change('apps/web/src/main.js','// USER_CALLER_ID_UI_V1','dialForm.noValidate=true;',"\n// USER_CALLER_ID_UI_V1\nsetupUserCallerIdAdmin({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin',show:()=>showWorkspace('admin')});",True)
 for p,s in pending.items():p.write_text(s)
 return len(pending)
if __name__=='__main__':print('User caller ID controls integrated:',integrate(Path(sys.argv[1])))
