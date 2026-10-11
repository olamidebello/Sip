import test from 'node:test';
import assert from 'node:assert/strict';
import {aiSupportKey,handleAiConfiguration} from './aiConfiguration.js';

test('super admin saves a write-only encrypted key and can remove it',async()=>{
  const previous=process.env.AI_CONFIG_KEY;process.env.AI_CONFIG_KEY='a'.repeat(64);
  let cipher=null,response;
  const pool={query:async(sql,params=[])=>{
    if(sql.startsWith('SELECT secret_cipher'))return {rowCount:cipher?1:0,rows:cipher?[{secret_cipher:cipher,enabled:1}]:[]};
    if(sql.startsWith('SELECT enabled'))return {rowCount:cipher?1:0,rows:cipher?[{enabled:1,updated_at:'now'}]:[]};
    if(sql.startsWith('INSERT INTO ai_support_configuration'))cipher=params[0];
    if(sql.startsWith('DELETE FROM ai_support_configuration'))cipher=null;
    return {rowCount:1,rows:[]};
  }};
  const send=(_res,status,body)=>{response={status,body};};
  const user={id:'actor',tenant_id:'tenant',role:'super_admin'};
  try{
    await handleAiConfiguration({req:{method:'PUT'},res:{},user,pool,send,readJson:async()=>({apiKey:'sk-'+ 'x'.repeat(30)})});
    assert.equal(response.status,200);assert.equal(response.body.apiKey,undefined);
    assert.ok(!Buffer.from(cipher).includes(Buffer.from('sk-')));
    assert.equal(await aiSupportKey(pool),'sk-'+ 'x'.repeat(30));
    await handleAiConfiguration({req:{method:'GET'},res:{},user,pool,send});
    assert.equal(response.body.configured,true);assert.equal(response.body.apiKey,undefined);
    await handleAiConfiguration({req:{method:'DELETE'},res:{},user,pool,send});
    assert.equal(await aiSupportKey(pool),null);
  }finally{if(previous===undefined)delete process.env.AI_CONFIG_KEY;else process.env.AI_CONFIG_KEY=previous;}
});

test('ordinary users cannot manage AI credentials',async()=>{
  let response;
  await handleAiConfiguration({req:{method:'GET'},res:{},user:{role:'user'},pool:{},
    send:(_res,status,body)=>{response={status,body};}});
  assert.equal(response.status,403);
});
