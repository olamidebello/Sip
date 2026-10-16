import {createDatabase} from './db.js';
const pool=createDatabase(process.env.MYSQL_URL);
try{
 const components=(await pool.query('SELECT component FROM schema_components')).rows.map(r=>r.component);
 const required=['marketplace_control','store_gateways','product_store','payments'];
 const missing=required.filter(c=>!components.includes(c));
 if(missing.length)throw Error('Missing schema components: '+missing.join(', '));
 const stores=(await pool.query('SELECT COUNT(*) AS count FROM marketplace_stores WHERE authorized=TRUE AND enabled=TRUE')).rows[0].count;
 console.log(JSON.stringify({schema:'ready',migratedComponents:components.length,authorizedStores:Number(stores),paymentEncryptionReady:/^[a-f0-9]{64}$/i.test(process.env.PAYMENT_CONFIG_KEY||''),commissioning:['Authorize reseller workspaces in Payment administration','Add recommended plans, review terms and publish confirmed services','Configure merchant credentials per store','Complete sandbox checkout and verify invoice reconciliation','Fulfill paid orders only after actual provisioning','Providers listed as adapter not implemented cannot accept payments']},null,2));
}finally{await pool.end();}
