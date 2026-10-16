import fs from 'node:fs';
import {createDatabase} from './db.js';
const audit=JSON.parse(fs.readFileSync(new URL('./data/module-audit.json',import.meta.url),'utf8'));
const pool=createDatabase(process.env.MYSQL_URL);
try{
 const applied=(await pool.query('SELECT component FROM schema_components')).rows.map(r=>r.component);
 const missing=audit.schemaComponents.filter(name=>!applied.includes(name));
 console.log(JSON.stringify({sourceModules:audit.summary.apiSourceModules,applicationFeatures:audit.summary.applicationFeatures,kamailioInventory:audit.summary.kamailioModules,requiredSchemaComponents:audit.schemaComponents.length,appliedSchemaComponents:applied.length,missingSchemaComponents:missing,featureStates:audit.summary.featureStates,applicationSchema:missing.length?'incomplete':'ready',liveAcceptance:'unverified',scope:'This checks registered application migrations. Host processes, credentials, switch routing, device calling and provider settlement require independent commissioning evidence.'},null,2));
 if(missing.length)process.exitCode=1;
}finally{await pool.end();}
