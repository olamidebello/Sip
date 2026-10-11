import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultHelpPreferences,validateHelpPreferences,handleHelpPreferences} from './helpPreferences.js';

test('only bounded internal guide customizations are accepted',()=>{
  assert.equal(validateHelpPreferences(defaultHelpPreferences),true);
  assert.equal(validateHelpPreferences({...defaultHelpPreferences,overrides:{meetings:{hint:'Join a room.',guide:'help-user'}}}),true);
  assert.equal(validateHelpPreferences({...defaultHelpPreferences,overrides:{meetings:{hint:'a'.repeat(241),guide:'help-user'}}}),false);
  assert.equal(validateHelpPreferences({...defaultHelpPreferences,overrides:{meetings:{hint:'Open',guide:'https://example.com'}}}),false);
});
test('preferences are saved and read for the authenticated user only',async()=>{
  const queries=[],pool={query:async(sql,args)=>{queries.push([sql,args]);return {rows:[]};}};
  let result;const send=(_res,status,body)=>{result={status,body};};
  const value={...defaultHelpPreferences,showHints:false};
  await handleHelpPreferences({req:{method:'PUT'},res:{},user:{id:'user-1'},pool,send,readJson:async()=>value});
  assert.equal(result.status,200);assert.deepEqual(queries[0][1],['user-1',JSON.stringify(value)]);
  await handleHelpPreferences({req:{method:'GET'},res:{},user:{id:'user-2'},pool,send});
  assert.deepEqual(queries[1][1],['user-2']);assert.equal(result.body.showHints,true);
});
