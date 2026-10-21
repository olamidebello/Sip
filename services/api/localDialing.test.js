import {test} from 'node:test';
import assert from 'node:assert/strict';
import {expandLocalDestination as expand,profileDestination} from './localDialing.js';
test('local numbers use saved country and remove its trunk prefix',()=>{
 assert.equal(expand('123456789','NG'),'234123456789');
 assert.equal(expand('020123456','GH'),'23320123456');
 assert.equal(expand('1234567','US','+13109515282'),'13101234567');
 assert.equal(expand('12345678','DE'),'4912345678');
});
test('international country-code numbers are unchanged',()=>{
 for(const value of ['+234123456789','19452205026'])assert.equal(expand(value,'NG'),value);
 assert.throws(()=>expand('1234567',''),/profile country/);
 assert.throws(()=>expand('abc','NG'),/phone number/);
});
test('profile lookup is scoped to authenticated tenant',async()=>{
 const db={query:async(sql,args)=>{if(sql.includes('FROM dialing_policies'))return {rows:[]};assert.match(sql,/u.tenant_id=\$2/);assert.deepEqual(args,['user','tenant']);return {rows:[{country:'NG'}]};}};
 assert.equal(await profileDestination(db,'tenant','user','123456789'),'234123456789');
 assert.equal(await profileDestination({query:async()=>({rows:[{country:'US'}]})},'tenant','user','19452205026'),'19452205026');
});

test('removes only the saved country IDD and never adds home country afterward',()=>{
 assert.equal(expand('0112348031234567','US'),'2348031234567');
 assert.equal(expand('00919452205026','NG'),'19452205026');
 assert.equal(expand('00112348031234567','AU'),'2348031234567');
 assert.equal(expand('01019452205026','JP'),'19452205026');
 assert.equal(expand('81019452205026','RU'),'19452205026');
 assert.equal(expand('+19452205026','NG'),'+19452205026');
 assert.throws(()=>expand('011123','US'),/complete international/);
 assert.equal(expand('01123456789','NG'),'2341123456789');
});

test('non-ten-digit national numbers receive the profile country code',()=>{
 assert.equal(expand('08031234567','NG'),'2348031234567');
 assert.equal(expand('02079460000','GB'),'442079460000');
 assert.equal(expand('1234567','US','+13109515282'),'13101234567');
 assert.equal(expand('8031234567','NG'),'2348031234567');
 assert.equal(expand('2348031234567','US'),'2348031234567');
});

test('exactly ten national digits receive the profile country calling code',()=>{
 assert.equal(expand('3109515282','US'),'13109515282');
 assert.equal(expand('8031234567','NG'),'2348031234567');
 assert.equal(expand('3109515282','CA'),'13109515282');
 assert.equal(expand('+13109515282','NG'),'+13109515282');
 assert.equal(expand('13109515282','US'),'13109515282');
 assert.throws(()=>expand('3109515282',''),/profile country/);
});

test('seven digits use country plus first three national profile-phone digits',async()=>{
 assert.equal(expand('9515282','US','+13105550123'),'13109515282');
 assert.equal(expand('1234567','NG','+2348035550123'),'2348031234567');
 assert.equal(expand('1234567','GB','+442079460000'),'442071234567');
 assert.throws(()=>expand('9515282','US',''),/profile phone/);
 assert.throws(()=>expand('9515282','NG','+13105550123'),/matching/);
 const db={query:async(sql,args)=>{if(sql.includes('FROM dialing_policies'))return {rows:[]};assert.match(sql,/p.phone_e164/);assert.deepEqual(args,['u','t']);return {rows:[{country:'US',phone_e164:'+13105550123'}]};}};
 assert.equal(await profileDestination(db,'t','u','9515282'),'13109515282');
});
