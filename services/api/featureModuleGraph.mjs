// Parse local ESM dependencies without evaluating application code or starting workers.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {SourceTextModule} from 'node:vm';
const pending=[resolve(process.argv[2]||'server.js')],seen=new Set();
while(pending.length){
 const file=pending.pop();if(seen.has(file))continue;seen.add(file);
 if(!existsSync(file)){console.error('SIP_FEATURE_DETAIL missing_module='+file);process.exit(1);}
 const text=readFileSync(file,'utf8');
 if(extname(file)==='.json'){JSON.parse(text);continue;}
 const module=new SourceTextModule(text,{identifier:file});
 for(const specifier of module.dependencySpecifiers)if(specifier.startsWith('.'))pending.push(resolve(dirname(file),specifier));
}
console.log('Local application module graph checked: '+seen.size+' files');
