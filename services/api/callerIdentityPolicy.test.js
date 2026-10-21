import test from 'node:test';import assert from 'node:assert/strict';
import {resolveCallerIdentity,handleCallerIdentityPolicy} from './callerIdentityPolicy.js';
function db({strict=false,approval={number_e164:'+19452205026',authorized:1},phone='+19452205026',rented=null}={}){return {query:async(s,args)=>{assert.ok(args.includes('tenant'));return {rows:s.includes('require_assigned_did')?(strict?[{require_assigned_did:1}]:[]):s.includes('managed_outbound')?(approval?[approval]:[]):s.includes('user_profiles')?[{phone_e164:phone}]:s.includes('user_primary_did')?(rented?[{number_e164:rented}]:[]):[]};}};}
const options={policyLoader:()=>({tenants:{}}),assigned:()=>null};
test('authorized profile is the default and precedes rented DID',async()=>assert.equal((await resolveCallerIdentity(db({rented:'+12125550123'}),'tenant','user',options)).callerId,'+19452205026'));
test('administrator disable remains effective',async()=>assert.rejects(resolveCallerIdentity(db({approval:{authorized:0}}),'tenant','user',options),/disabled/));
test('edited or unapproved profile cannot impersonate authorized number',async()=>{for(const opt of [{phone:'+12125550123'},{approval:null}])await assert.rejects(resolveCallerIdentity(db(opt),'tenant','user',options),/requires caller-ID authorization/);});
test('strict policy rejects profile-only calls',async()=>assert.rejects(resolveCallerIdentity(db({strict:true}),'tenant','user',options),/No authorized outbound DID/));
test('strict policy accepts an active assigned rental',async()=>assert.equal((await resolveCallerIdentity(db({strict:true,rented:'+12125550123'}),'tenant','user',options)).callerId,'+12125550123'));
test('only super admins can change enforcement',async()=>{const r=await handleCallerIdentityPolicy({req:{method:'PUT'},res:{},user:{role:'admin'},send:(_,status)=>status});assert.equal(r,403);});
