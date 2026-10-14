import test from 'node:test';
import assert from 'node:assert/strict';
import * as legacy from './switch.js';
test('historical schema is preserved without executable switch routes', async()=>{
 assert.deepEqual(Object.keys(legacy),['migrateSwitch']);
 const queries=[];await legacy.migrateSwitch({query:async q=>queries.push(q)});
 assert.equal(queries.length,2);assert.ok(queries.every(q=>q.startsWith('CREATE TABLE IF NOT EXISTS')));
});
