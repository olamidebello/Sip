import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredAuthColumns,inspectAuthColumns,auditAuthSchema} from './authSchema.js';
const rows=Object.entries(requiredAuthColumns).flatMap(([TABLE_NAME,columns])=>columns.map(COLUMN_NAME=>({TABLE_NAME,COLUMN_NAME})));
test('complete shared schema passes without creating a duplicate identity database',()=>{assert.equal(inspectAuthColumns(rows).ready,true);assert.equal(inspectAuthColumns(rows).tables,15);});
test('missing PIN, OTP and role columns are reported precisely',()=>{for(const name of ['users.role','twilio_account_pins.pin_hash','twilio_account_challenges.token_hash']){const report=inspectAuthColumns(rows.filter(r=>r.TABLE_NAME+'.'+r.COLUMN_NAME!==name));assert.equal(report.ready,false);assert.deepEqual(report.missing,[name]);}});
test('schema audit reads only metadata and fails when migrations are incomplete',async()=>{let query;await assert.rejects(auditAuthSchema({query:async sql=>{query=sql;return {rows:[]};}}),/Missing authentication schema/);assert.match(query,/information_schema.columns/);assert.doesNotMatch(query,/password_hash FROM users/);assert.equal((await auditAuthSchema({query:async()=>({rows})})).ready,true);});
