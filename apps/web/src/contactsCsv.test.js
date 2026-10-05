import test from "node:test";
import assert from "node:assert/strict";
import {contactEmailsFromCsv,contactsToCsv} from "./contactsCsv.js";

test("imports email column with quoted names and normalizes emails",()=>{
  assert.deepEqual(contactEmailsFromCsv('name,email\r\n"Bello, Olamide",OLAMIDE@example.com\r\n'),["olamide@example.com"]);
});
test("rejects missing header, malformed data, and files over the batch limit",()=>{
  assert.throws(()=>contactEmailsFromCsv("name\nAda"));
  assert.throws(()=>contactEmailsFromCsv("email\ninvalid"));
  assert.throws(()=>contactEmailsFromCsv("email\n"+"a@example.com\n".repeat(501)));
});
test("export quotes spreadsheet formula cells and round trips email",()=>{
  const csv=contactsToCsv([{email:"ada@example.com",name:'Ada "A"'}]);
  assert.match(csv,/"Ada ""A"""/);
  assert.deepEqual(contactEmailsFromCsv(csv),["ada@example.com"]);
  assert.match(contactsToCsv([{email:"ada@example.com",name:"=1+1"}]),/"'=1\+1"/);
});
