import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupMarketplaceControl} from './marketplaceControl.js';
test('reseller can rename its store but cannot edit authorization flags',async()=>{
 const dom=new JSDOM('<section id="payment-admin"></section>');global.document=dom.window.document;
 const calls=[];
 try{
 const ui=setupMarketplaceControl({get:async path=>path.endsWith('/stores')?{editable:false,stores:[{id:'tenant',tenant_name:'Reseller',name:'Own store',authorized:true,enabled:true,gateway_admin:true}]}:{editable:true,catalog:[{id:'paystack',name:'Paystack',implemented:true},{id:'paypal',name:'PayPal',implemented:false}],gateways:[]},request:async(...args)=>calls.push(args)});
 await ui.refresh();
 const store=document.querySelector('#market-stores form');assert.ok([...store.querySelectorAll('[type=checkbox]')].every(c=>c.disabled));
 store.querySelector('input').value='New store';await store.onsubmit({preventDefault(){}});assert.deepEqual(calls[0],['/api/admin/marketplace/profile',{name:'New store'},'PUT']);
 assert.match(document.querySelector('#market-gateways').textContent,/PayPal: adapter not implemented/);
 const gateway=document.querySelector('#market-gateway-form');gateway.elements.secretKey.value='private-key';await gateway.onsubmit({preventDefault(){},currentTarget:gateway});assert.equal(gateway.elements.secretKey.value,'');
 }finally{dom.window.close();delete global.document;}
});
