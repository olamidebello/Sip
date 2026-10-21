import test from 'node:test';
import assert from 'node:assert/strict';
import {handleVpn} from './vpn.js';
const tenant='a'.repeat(36),id='b'.repeat(36);
function invoke(path,role,method,extra={}){let result;return handleVpn({req:{method},res:{setHeader(k,v){assert.equal(v,'no-store');}},path,user:{id,tenant_id:tenant,role},send:(r,c,b)=>{result={c,b};},readJson:async()=>({enabled:true}),...extra}).then(()=>result);}
test('non-super administrators cannot manage VPN',async()=>{for(const role of ['user','admin'])assert.equal((await invoke('/api/admin/vpn',role,'GET',{request:()=>assert.fail()})).c,403);});
test('self provisioning always uses authenticated identity',async()=>{const r=await invoke('/api/vpn','user','GET',{request:async data=>{assert.deepEqual(data,{tenant,user:id,op:'provision'});return {provisioned:true};}});assert.equal(r.c,200);});
test('configuration download only returns own profile',async()=>{assert.equal((await invoke('/api/vpn/config','user','POST',{request:async data=>{assert.equal(data.user,id);return {config:'private'};}})).b.config,'private');});
test('cross-workspace target is denied before broker access',async()=>{const r=await invoke('/api/admin/vpn/users/'+id,'super_admin','PUT',{pool:{query:async(sql,args)=>{assert.deepEqual(args,[id,tenant]);return {rows:[]};}},request:()=>assert.fail()});assert.equal(r.c,404);});
test('broker failures become unavailable, not fabricated connection success',async()=>{assert.equal((await invoke('/api/vpn','user','GET',{request:async()=>{throw Error('Service unavailable');}})).c,503);});
