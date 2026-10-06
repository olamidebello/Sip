import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { pageId, pagePath } from './pageRoutes.js';

test('form pages have stable direct paths', () => {
  for (const id of ['signup', 'login', 'ldap-login', 'support-create', 'tenant-user-create'])
    assert.equal(pageId(pagePath(id)), id);
  assert.equal(pageId('/pages/login/'), 'login');
  assert.equal(pageId('/pages/unknown/extra'), null);
  assert.equal(pageId('/pages/%2F'), null);
});
