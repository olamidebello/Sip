import test from 'node:test';
import assert from 'node:assert/strict';
import {validateQuestion,extractAnswer,handleHelpAgent} from './helpAgent.js';
test('rejects empty or overlong questions',()=>{
  assert.throws(()=>validateQuestion('  '));
  assert.throws(()=>validateQuestion('a'.repeat(1201)));
  assert.equal(validateQuestion('  How do I register?  '),'How do I register?');
});
test('supports Responses output text',()=>{
  assert.equal(extractAnswer({output:[{content:[{type:'output_text',text:'Open Support tickets.'}]}]}),'Open Support tickets.');
});
test('returns configured status and refuses unauthenticated provider absence',async()=>{
  const old=process.env.OPENAI_SUPPORT_API_KEY;delete process.env.OPENAI_SUPPORT_API_KEY;
  let status,body;const send=(_res,code,data)=>{status=code;body=data;};
  await handleHelpAgent({req:{method:'GET'},res:{},user:{id:'test'},send});assert.equal(body.available,false);
  await handleHelpAgent({req:{method:'POST'},res:{},user:{id:'test'},send});assert.equal(status,503);
  if(old)process.env.OPENAI_SUPPORT_API_KEY=old;
});
test('configured AI request stays server-side and is not stored by provider',async()=>{
  const old=process.env.OPENAI_SUPPORT_API_KEY;process.env.OPENAI_SUPPORT_API_KEY='server-only-test-key';
  let request,result;
  try{
    await handleHelpAgent({req:{method:'POST'},res:{},user:{id:'example-user'},readJson:async()=>({question:'How do I call?'}),
      send:(_res,status,body)=>{result={status,body};},
      fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'Open the dialer.'}]}]})};}});
    assert.equal(result.status,200);assert.equal(result.body.answer,'Open the dialer.');
    assert.equal(request.url,'https://api.openai.com/v1/responses');
    assert.equal(JSON.parse(request.options.body).store,false);
    assert.equal(request.options.headers.Authorization,'Bearer server-only-test-key');
  }finally{if(old)process.env.OPENAI_SUPPORT_API_KEY=old;else delete process.env.OPENAI_SUPPORT_API_KEY;}
});
