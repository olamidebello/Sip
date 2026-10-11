import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';

test('assigned account retry bypasses empty manual fields and restarts after authorization failure',async()=>{
  const app=await appFixture();
  try{
    await app.signIn('user');
    const original=app.window.fetch;
    let sessions=0;
    app.window.fetch=async(path,options)=>{
      if(path==='/api/sip-account/session'){
        sessions++;
        return {ok:true,status:202,json:async()=>({status:'pending',note:'Waiting for switch activation'})};
      }
      return original(path,options);
    };
    const form=app.document.querySelector('#connect');
    form.elements.aor.value='';form.elements.server.value='';
    app.document.querySelector('#connect-assigned-sip').click();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(sessions,1);
    assert.equal(app.document.querySelector('#status').textContent,'Waiting for switch activation');
  }finally{app.close();}
});
