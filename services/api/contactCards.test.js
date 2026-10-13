import test from 'node:test';
import assert from 'node:assert/strict';
import {handleContactCards} from './contactCards.js';
test('private contact card reads are scoped to authenticated owner',async()=>{let args;const result=await handleContactCards({req:{method:'GET',url:'/api/contacts/card?key=sip%3Aa%40b.com'},user:{id:'owner'},pool:{query:async(_,a)=>{args=a;return {rows:[]};}},send:(_,code,body)=>({code,body})});assert.deepEqual(args,['owner','sip:a@b.com']);assert.equal(result.body.card.favorite,false);});
test('card edits reject unexpected fields before writing',async()=>{const r=await handleContactCards({req:{method:'PUT'},user:{id:'owner'},readJson:async()=>({key:'x',card:{name:'A',about:'',labels:'',favorite:true,owner_id:'other'}}),pool:{query:()=>{throw Error('Unexpected write');}},send:(_,code)=>code});assert.equal(r,400);});
