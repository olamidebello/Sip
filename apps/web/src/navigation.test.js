import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';
import {fragmentTarget} from './workspaceNavigation.js';

test('every role menu opens an accessible destination and keeps the URL synchronized',async()=>{
  const app=await appFixture();try{
    for(const role of ['user','admin','super_admin']){
      await app.signIn(role);
      const links=[...app.document.querySelectorAll('#app-nav .menu-links > a')];
      assert.ok(links.length>=20);
      for(const link of links){link.click();const target=app.document.getElementById(link.hash.slice(1));
        assert.equal(target.closest('[hidden],.workspace-inactive'),null,role+' '+link.hash);
        assert.equal(app.window.location.pathname,'/');assert.equal(app.window.location.hash,link.hash);
      }
      if(role==='user')assert.equal(app.document.querySelector('#app-nav a[href="#provider-credentials-admin"]'),null);
    }
  }finally{app.close();}
});
test('configuration links open credentials and group links reveal their containing admin panel',async()=>{
  const app=await appFixture();try{await app.signIn();
    app.window.audit.showWorkspace('didww-admin');app.document.getElementById('didww-manage-config').click();
    assert.equal(app.window.location.hash,'#provider-credentials-admin');
    assert.equal(app.document.getElementById('provider-credentials-form').closest('.workspace-inactive'),null);
    app.document.querySelector('#group-admin .section-index a').click();
    const group=app.document.getElementById(fragmentTarget(app.window.location.hash));
    assert.equal(group.open,true);assert.equal(group.closest('.workspace-inactive'),null);
  }finally{app.close();}
});
test('form routes preserve the selected form and returning to the same panel restores all forms',async()=>{
  const app=await appFixture();try{await app.signIn();
    app.window.audit.pageRoutes.go('group-create');
    assert.equal(app.window.location.pathname,'/pages/group-create');
    assert.equal(app.document.getElementById('group-create').closest('.page-route-hidden,.workspace-inactive'),null);
    app.document.querySelector('#app-nav a[href="#group-admin"]').click();
    assert.equal(app.window.location.pathname,'/');
    assert.equal(app.document.querySelector('#group-admin .page-route-hidden'),null);
  }finally{app.close();}
});
test('browser history restores the matching workspace and malformed hashes do not throw',async()=>{
  const app=await appFixture();try{await app.signIn();
    app.window.audit.showWorkspace('support');app.window.history.replaceState(null,'','/#billing');
    app.window.dispatchEvent(new app.window.PopStateEvent('popstate'));
    assert.equal(app.document.getElementById('billing').classList.contains('workspace-inactive'),false);
    assert.equal(app.document.getElementById('support').classList.contains('workspace-inactive'),true);
    assert.equal(fragmentTarget('#%E0%A4%A'),null);
  }finally{app.close();}
});
test('form menu rebuilds exclude hidden forms and do not duplicate page entries',async()=>{
  const app=await appFixture();try{await app.signIn('admin');
    const urls=()=>[...app.document.querySelectorAll('#app-nav .page-links a')].map(a=>a.pathname);
    const before=urls();app.window.audit.pageRoutes.refresh();assert.deepEqual(urls(),before);
    assert.equal(new Set(before).size,before.length);
    for(const path of before){const form=app.document.getElementById(path.split('/').pop());assert.equal(form.closest('[hidden]'),null);}
  }finally{app.close();}
});
test('all visible action buttons and forms have handlers; quick preferences reach the backend',async()=>{
  const app=await appFixture();try{await app.signIn();
    for(const button of app.document.querySelectorAll('button[id][type="button"]')){
      if(button.closest('[hidden]'))continue;
      assert.ok(button.onclick||app.registrations.get(button)?.has('click'),button.id+' has no handler');
    }
    for(const form of app.document.querySelectorAll('form[id]')){
      if(form.id==='quick-locale'||form.closest('[hidden]'))continue;
      assert.ok(form.onsubmit||app.registrations.get(form)?.has('submit'),form.id+' has no submit handler');
    }
    app.window.audit.updateNavigation();const quick=app.document.getElementById('quick-locale');
    assert.equal(quick.elements.language.value,'en');assert.equal(quick.elements.currency.value,'USD');
    quick.dispatchEvent(new app.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,10));
    const save=app.calls.find(c=>c.path==='/api/locales'&&c.options.method==='PUT');assert.ok(save);
    assert.deepEqual(JSON.parse(save.options.body),{language:'en',country:'US',currency:'USD'});
    app.window.audit.resetWorkspace();assert.equal(app.document.getElementById('activity-monitor').hidden,true);assert.equal(app.document.getElementById('fleet-admin').hidden,true);
  }finally{app.close();}
});

test('dashboard and search hash shortcuts leave a form page and reveal nested calling tools',async()=>{
  const app=await appFixture();try{await app.signIn();
    app.window.audit.pageRoutes.go('group-create');
    app.window.location.hash='softphone-tools';
    app.window.dispatchEvent(new app.window.HashChangeEvent('hashchange'));
    assert.equal(app.window.location.pathname,'/');
    const tools=app.document.getElementById('softphone-tools');
    assert.equal(tools.closest('.workspace-inactive'),null);
    assert.equal(tools.closest('details').open,true);
  }finally{app.close();}
});
