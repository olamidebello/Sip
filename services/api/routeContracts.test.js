import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

test('GUI API destinations enter the authenticated router or explicit public handlers',async()=>{
  const source=await readFile(new URL('./server.js',import.meta.url),'utf8');
  const start=source.indexOf('    if (path==="/api/activity/events"');
  assert.ok(start>=0,'Activity ingestion must enter the authenticated router');
  const end=source.indexOf('      const user = await currentUser(req);',start);
  const condition=source.slice(start,end).trim().slice(4).replace(/\)\s*\{$/,'');
  const authenticated=new Function('path',`return (${condition});`);
  const publicPrefixes=['/api/register','/api/passkeys','/api/login','/api/ldap-login','/api/logout','/api/me','/api/config','/api/plans'];
  const dir=new URL('../../apps/web/src/',import.meta.url),missing=[];
  for(const file of await readdir(dir)){
    if(!file.endsWith('.js')||file.endsWith('.test.js'))continue;
    const client=await readFile(new URL(file,dir),'utf8');
    for(const match of client.matchAll(/["'`](\/api\/[^"'`\s?#$]*)/g)){
      const path=match[1];
      if(!authenticated(path)&&!publicPrefixes.some(prefix=>path.startsWith(prefix)))missing.push(`${file}: ${path}`);
    }
  }
  assert.deepEqual(missing,[]);
});
