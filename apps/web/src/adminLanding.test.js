import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';
import {pageId,pagePath} from './pageRoutes.js';

test('administrative forms have direct admin paths',()=>{
  assert.equal(pagePath('tenant-user-create',true),'/admin/pages/tenant-user-create');
  assert.equal(pageId('/admin/pages/tenant-user-create'),'tenant-user-create');
});
test('user login opens chats and cannot open administrative panels',async()=>{
  const app=await appFixture();try{
    await app.signIn('user');
    assert.equal(app.window.location.hash,'#chat');
    assert.ok(app.document.body.classList.contains('messenger-mode'));
    assert.equal(app.window.audit.showWorkspace('admin'),false);
    assert.equal(app.document.querySelector('#app-nav a[href="/admin"]'),null);
    assert.ok(app.calls.some(call=>call.path==='/api/sip-account/session'));
  }finally{app.close();}
});
test('administrator switches between separate admin and user navigation',async()=>{
  const app=await appFixture();try{
    await app.signIn();
    app.document.querySelector('#app-nav a[href="/admin"]').click();
    assert.equal(app.window.location.pathname,'/admin');
    assert.equal(app.window.location.hash,'#admin');
    assert.ok(app.document.body.classList.contains('admin-mode'));
    for(const link of app.document.querySelectorAll('#app-nav .menu-links a'))assert.ok(link.pathname.startsWith('/admin'));
    assert.ok(app.document.querySelector('#app-nav .page-links a[href^="/admin/pages/"]'));
    app.document.querySelector('#app-nav a[href="/#chat"]').click();
    assert.equal(app.window.location.pathname,'/');
    assert.ok(app.document.body.classList.contains('messenger-mode'));
  }finally{app.close();}
});
