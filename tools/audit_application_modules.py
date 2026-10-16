#!/usr/bin/env python3
"""Enumerate source evidence. Never treat static references as runtime acceptance."""
import argparse,collections,json,pathlib,re,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
def inventory(root=ROOT):
 api=root/'services/api';web=root/'apps/web/src';server=(api/'server.js').read_text();migration=(api/'migrate.js').read_text()
 tests=list(api.glob('*.test.js'));test_sources={p.name:p.read_text() for p in tests}
 sources=sorted(p for p in api.glob('*.js') if not p.name.endswith('.test.js'))
 import_pattern=r"from\s*['\"]\./([^'\"]+)['\"]"
 imports=re.findall(import_pattern,server)
 migrated=set(re.findall(import_pattern,migration))
 reachable=set(imports);pending=list(imports)
 while pending:
  name=pending.pop();p=api/name
  if not p.is_file() or p.suffix!='.js':continue
  for child in re.findall(import_pattern,p.read_text()):
   if child not in reachable:reachable.add(child);pending.append(child)
 rows=[]
 for p in sources:
  src=p.read_text();exports=re.findall(r'export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)',src)
  handlers=[v for v in exports if v.startswith('handle')];workers=[v for v in exports if v.startswith('start')]
  rows.append({'id':p.stem,'source':str(p.relative_to(root)),'sha256':__import__('hashlib').sha256(p.read_bytes()).hexdigest(),
   'exportedHandlers':handlers,'serverReferencedHandlers':[v for v in handlers if re.search(r'\b'+re.escape(v)+r'\s*\(',server)],
   'exportedWorkers':workers,'serverStartedWorkers':[v for v in workers if re.search(r'\b'+re.escape(v)+r'\s*\(',server)],
   'reachableFromServer':p.name in reachable,'migrationImported':p.name in migrated,
   'tests':[name for name,code in test_sources.items() if "./"+p.name in code],
   'guiReferences':[str(q.relative_to(root)) for q in web.glob('*.js') if not q.name.endswith('.test.js') and p.stem in q.read_text()],
   'liveAcceptance':'unverified'})
 clients=[]
 for family in ['web','mobile','desktop']:
  base=root/'apps'/family
  for p in sorted(base.rglob('*')):
   if not p.is_file() or any(x in p.parts for x in ['node_modules','dist','android','ios','ios-build']) or p.suffix not in ['.js','.cjs','.ts','.tsx','.jsx','.java','.swift','.py','.rb','.sh','.html'] or p.name.endswith('.test.js'):continue
   clients.append({'source':str(p.relative_to(root)),'family':family,'liveAcceptance':'unverified'})
 features=json.loads((api/'telecomFeatureCatalog.json').read_text());kam=json.loads((api/'kamailio-catalog.json').read_text())
 # Feature status is the maintainers' declared scope, separate from the evidence above.
 return {'schemaVersion':1,'scope':'Static source inventory only. Tests listed here are present, not necessarily passing. Installation, credentials, runtime service loading and real call/payment acceptance require separate evidence.',
  'summary':{'clientSourceModules':len(clients),'apiSourceModules':len(rows),'applicationFeatures':len(features),'featureStates':dict(collections.Counter(f['implementation'] for f in features)),'kamailioModules':len(kam['modules'])},
  'clientModules':clients,'schemaComponents':re.findall(r"\['([^']+)',\s*\(\) =>",migration),'apiModules':rows,'features':features,'kamailioModules':[dict(m,installation='unverified',runtimeLoaded='unverified',liveAcceptance='unverified') for m in kam['modules']],
  'buildTargets':{'api':'npm test --prefix services/api','web':'npm test --prefix apps/web && npm run build --prefix apps/web','mobile':'apps/mobile (native build prerequisites and device acceptance required)','desktop':'apps/desktop (platform packaging and device acceptance required)'}}
def markdown(data):
 text=['# SIP module-by-module audit','',data['scope'],'',f"API source modules: {data['summary']['apiSourceModules']}. Application feature entries: {data['summary']['applicationFeatures']}. Kamailio entries: {data['summary']['kamailioModules']}.",'','## API sources','','| Module | Reachable from server | Migration import | Tests present | Handler/worker references |','| --- | --- | --- | --- | --- |']
 for m in data['apiModules']:
  refs=m['serverReferencedHandlers']+m['serverStartedWorkers'];text.append(f"| {m['id']} | {m['reachableFromServer']} | {m['migrationImported']} | {', '.join(m['tests']) or 'none identified'} | {', '.join(refs) or 'library / CLI / no direct reference'} |")
 text+=['','## Client sources','','| Source | Client | Device acceptance |','| --- | --- | --- |']
 for c in data['clientModules']:text.append(f"| {c['source']} | {c['family']} | unverified |")
 text+=['','## Feature review queue','','| Feature | Declared implementation | Remaining scope / evidence |','| --- | --- | --- |']
 for f in data['features']:text.append('| '+f['name']+' | '+f['implementation']+' | '+f['detail'].replace('|','\\|')+' |')
 text+=['','## Kamailio review queue','','Each catalog entry needs a compatible reviewed profile and per-node runtime evidence. No entry is marked installed by this source audit.','','| Module | Declared maturity | Installation / runtime / acceptance |','| --- | --- | --- |']
 for m in data['kamailioModules']:text.append(f"| {m['id']} | {m.get('maturity','unknown')} | unverified / unverified / unverified |")
 return '\n'.join(text)+'\n'
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args();data=inventory();out=ROOT/'services/api/data/module-audit.json';md=ROOT/'MODULE-AUDIT.md';encoded=json.dumps(data,indent=2)+'\n';report=markdown(data)
 if args.check:
  if not out.exists() or out.read_text()!=encoded or not md.exists() or md.read_text()!=report:raise SystemExit('Module inventory is stale. Run python3 tools/audit_application_modules.py')
 else:out.write_text(encoded);md.write_text(report)
 print(json.dumps(data['summary']))
