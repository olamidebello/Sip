import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProfilePhoto,handleProfilePhoto} from './messengerPreferences.js';
test('profile photos reject active content, invalid files and oversized payloads',()=>{for(const photo of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,aGVsbG8=', 'data:image/jpeg;base64,'+'A'.repeat(180000)])assert.throws(()=>validateProfilePhoto({photo}));});
test('photo operations scope all reads and writes to authenticated user',async()=>{for(const method of ['GET','PUT','DELETE']){const queries=[];let code;await handleProfilePhoto({req:{method},res:{},user:{id:'signed-in-user'},pool:{query:async(sql,args)=>{queries.push({sql,args});return {rows:[]};}},readJson:async()=>({photo:'data:image/jpeg;base64,/9j/2Q=='}),send:(res,status)=>code=status});assert.equal(code,200);assert.equal(queries[0].args[0],'signed-in-user');}});
