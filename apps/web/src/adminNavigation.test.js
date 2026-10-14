import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';
import {adminNavigationGroups} from './adminNavigation.js';
test('admin destinations are uniquely grouped',()=>{const ids=adminNavigationGroups.flatMap(g=>g.items.map(i=>i[0]));assert.equal(ids.length,new Set(ids).size);assert.equal(ids.length,41);});
test('super admin navigation opens existing panels, tracks location and filters groups',async()=>{
 const app=await appFixture({url:'https://sip.example.com/admin'});try{
  await app.signIn('super_admin');app.window.audit.showWorkspace('admin');
  const nav=app.document.querySelector('#app-nav');assert.equal(nav.dataset.groupedAdmin,'true');
  assert.equal(nav.querySelectorAll('.menu-group').length,8);assert.equal(nav.querySelectorAll('.page-links').length,0);
  for(const link of [...nav.querySelectorAll('.menu-links>a')]){link.click();assert.equal(app.window.location.hash,link.hash);assert.equal(app.document.getElementById(link.hash.slice(1)).closest('[hidden],.workspace-inactive'),null);assert.equal(link.getAttribute('aria-current'),'page');assert.match(nav.querySelector('.admin-location').textContent,new RegExp(link.textContent.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.equal(link.closest('details').open,true);}
  const search=nav.querySelector('.menu-search');search.value='payments';search.dispatchEvent(new app.window.Event('input'));assert.equal(nav.querySelector('a[href="/admin#payment-admin"]').hidden,false);assert.equal(nav.querySelector('a[href="/admin#group-admin"]').hidden,true);
  search.value='missing menu';search.dispatchEvent(new app.window.Event('input'));assert.equal(nav.querySelector('.menu-empty').hidden,false);
  search.value='';search.dispatchEvent(new app.window.Event('input'));assert.ok([...nav.querySelectorAll('.menu-links>a')].every(a=>!a.hidden));
  nav.querySelector('.admin-menu-toggle').click();assert.equal(nav.querySelector('.admin-menu-toggle').getAttribute('aria-expanded'),'true');nav.querySelector('a[href="/admin#payment-admin"]').click();assert.equal(nav.querySelector('.admin-menu-toggle').getAttribute('aria-expanded'),'false');
 }finally{app.close();}
});
test('administrator menu excludes super-admin destinations and user cannot enter admin panels',async()=>{const app=await appFixture();try{await app.signIn('admin');app.window.audit.showWorkspace('admin');assert.equal(app.document.querySelector('#app-nav a[href="/admin#tenant-admin"]'),null);await app.signIn('user');assert.equal(app.window.audit.showWorkspace('tenant-admin'),false);}finally{app.close();}});
