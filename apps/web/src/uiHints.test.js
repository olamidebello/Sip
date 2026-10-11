import test from 'node:test';
import assert from 'node:assert/strict';
import {guideFor} from './uiHints.js';

test('guide maps carrier settings to the administrator tutorial',()=>{
  const guide=guideFor('carrier-admin');
  assert.equal(guide.related,'help-admin');
  assert.match(guide.description,/trunk/);
});

test('forms without curated help still receive actionable guidance',()=>{
  const form={querySelector:selector=>selector.includes('button')?{textContent:'Save changes'}:null,
    querySelectorAll:()=>[{closest:()=>({childNodes:[{textContent:'Display name'}]})}],getAttribute:()=>null};
  const guide=guideFor('custom-form',form);
  assert.equal(guide.action,'Save changes');
  assert.deepEqual(guide.fields,['Display name']);
  assert.equal(guide.related,'help-user');
});
