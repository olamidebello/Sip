import test from 'node:test';
import assert from 'node:assert/strict';
import {payInvoiceFromWallet} from './walletPurchases.js';
const user={id:'user',tenant_id:'tenant'};
function poolFor({balance=1000,amount=500,status='unpaid',active=false,previous=false,currency='USD'}={}){
 const writes=[];const db={release(){},async query(sql,args){writes.push([sql,args]);
 if(sql.startsWith('SELECT i.id'))return {rows:[{id:'invoice',status,amount_cents:amount,currency}]};
 if(sql.includes('FROM wallet_purchases'))return {rows:previous?[{id:'existing'}]:[]};
 if(sql.includes('FROM payment_attempts'))return {rows:active?[{id:'pending'}]:[]};
 if(sql.includes('FROM wallet_accounts'))return {rows:[{balance_cents:balance,currency:'USD'}]};
 return {rows:[]};}};
 return {writes,async query(){return {rows:[]}},async connect(){return db}};
}
test('wallet debit and invoice payment commit in one transaction',async()=>{const p=poolFor();const r=await payInvoiceFromWallet(p,user,'invoice');assert.equal(r.balanceCents,500);assert.ok(p.writes.some(([s])=>s.startsWith('INSERT INTO wallet_purchases')));assert.equal(p.writes.at(-1)[0],'COMMIT');});
for(const options of [{balance:100},{active:true},{status:'paid'},{currency:'NGN'}])test('rejects unsafe checkout '+JSON.stringify(options),async()=>{const p=poolFor(options);const r=await payInvoiceFromWallet(p,user,'invoice');assert.equal(r.status,409);assert.equal(p.writes.at(-1)[0],'ROLLBACK');assert.ok(!p.writes.some(([s])=>s.startsWith('UPDATE wallet_accounts')));});
test('retry returns original purchase without a second debit',async()=>{const p=poolFor({previous:true,status:'paid'});const r=await payInvoiceFromWallet(p,user,'invoice');assert.equal(r.duplicate,true);assert.ok(!p.writes.some(([s])=>s.startsWith('UPDATE wallet_accounts')));});
