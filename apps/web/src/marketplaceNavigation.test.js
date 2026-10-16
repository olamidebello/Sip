import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';
test('marketplace navigation opens real admin controls and customer orders',async()=>{
 const app=await appFixture({url:'https://sip.example.com/admin'});try{
  await app.signIn('super_admin');app.window.audit.showWorkspace('payment-admin');
  for(const id of ['marketplace-stores-admin','product-store-admin','marketplace-orders-admin','marketplace-plans-admin','marketplace-gateways-admin','marketplace-reconciliation-admin','marketplace-stripe-admin']){
   const link=app.document.querySelector(`#app-nav a[href="/admin#${id}"]`);assert.ok(link,id+' menu exists');link.click();assert.equal(app.window.location.hash,'#'+id);assert.equal(app.document.getElementById(id).closest('[hidden],.workspace-inactive'),null);
  }
  assert.ok(app.document.querySelector('#store-product-create'));
  await app.signIn('user');app.window.audit.showWorkspace('product-store');
  const orders=app.document.querySelector('#app-nav a[href="/#marketplace-my-orders"]');assert.ok(orders);orders.click();assert.equal(app.window.location.hash,'#marketplace-my-orders');assert.equal(app.document.querySelector('#marketplace-my-orders').closest('[hidden],.workspace-inactive'),null);
  assert.ok(app.calls.some(c=>c.path==='/api/admin/marketplace/stores'));
 }finally{app.close();}
});
