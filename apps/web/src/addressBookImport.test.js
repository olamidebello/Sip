import test from 'node:test';
import assert from 'node:assert/strict';
import {addressBookFromFile} from './addressBookImport.js';
test('imports Google and Outlook email contacts with names and phones',()=>{
 assert.deepEqual(addressBookFromFile('Name,E-mail 1 - Value,Phone 1 - Value\n"Bello, O",OBELLO@example.org,+12345','google.csv'),[{name:'Bello, O',email:'obello@example.org',phone:'+12345'}]);
 assert.equal(addressBookFromFile('First Name,Last Name,E-mail Address,Mobile Phone\nO,Bello,o@example.org,+12345','outlook.csv')[0].name,'O Bello');
});
test('imports folded vCards, escaped names and phone-only contacts',()=>{
 assert.deepEqual(addressBookFromFile('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Bello\\, O\r\nTEL;TYPE=CELL:tel:+12345\r\nEND:VCARD','phone.vcf'),[{name:'Bello, O',email:'',phone:'+12345'}]);
 assert.equal(addressBookFromFile('BEGIN:VCARD\nFN:Long\n name\nEMAIL:x@example.org\nEND:VCARD','a.vcf')[0].name,'Longname');
});
test('rejects malformed, empty and oversized imports',()=>{
 for(const [text,file] of [['Name\nx','a.csv'],['email\ninvalid','a.csv'],['BEGIN:VCARD\nFN:Only name\nEND:VCARD','a.vcf'],['x'.repeat(256001),'a.csv']])assert.throws(()=>addressBookFromFile(text,file));
});
