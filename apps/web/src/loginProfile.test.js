import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';
test('login populates authenticated profile and logout clears it',async()=>{
 const app=await appFixture();
 try {
  app.window.audit.signedIn({id:'profile-user',name:'<script>name</script>',email:'user@example.com',role:'user',authSource:'local',features:{}});
  assert.equal(app.document.querySelector('#signed-in-profile').hidden,false);
  assert.equal(app.document.querySelector('#profile-name').value,'<script>name</script>');
  assert.equal(app.document.querySelector('#profile-email').value,'user@example.com');
  await app.document.querySelector('#logout').onclick();
  assert.equal(app.document.querySelector('#signed-in-profile').hidden,true);
  assert.equal(app.document.querySelector('#profile-name').value,'');
  assert.equal(app.document.querySelector('#profile-email').value,'');
 } finally {app.close();}
});
