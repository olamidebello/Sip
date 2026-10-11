import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProductImport,productHeaders} from './productImport.js';
const product={sku:'CUSTOM-001',name:'Service',category:'Services',description:'Description',terms:'',billing:'monthly',sellingCents:1995,resellerCents:1500,setupCents:0};
test('CSV preserves quoted fields and converts cents',()=>{
 const csv=productHeaders.join(',')+'\nCUSTOM-001,"Service, premium",Services,Description,,monthly,1995,1500,0';
 assert.deepEqual(parseProductImport(csv),[{...product,name:'Service, premium'}]);
});
test('JSON accepts array or products envelope',()=>{
 assert.deepEqual(parseProductImport(JSON.stringify([product]),true),[product]);
 assert.deepEqual(parseProductImport(JSON.stringify({products:[product]}),true),[product]);
});
test('rejects duplicate SKUs, empty or fractional prices and oversized batches',()=>{
 for(const items of [[product,product],[{...product,sellingCents:''}],[{...product,setupCents:1.5}],[],Array(501).fill(product)])assert.throws(()=>parseProductImport(JSON.stringify(items),true));
});
