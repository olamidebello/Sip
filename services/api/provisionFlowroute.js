import {flowrouteRequest} from './didFlowroute.js';
import {configureDidBilling} from './didPayments.js';
import {provisionDidOrder} from './didProvisioning.js';
import {provisionDidSms} from './didSms.js';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export async function ensureDidVoiceRoute(pool,order,{provider=flowrouteRequest,origin=process.env.PUBLIC_ORIGIN}={}){
 const base=new URL(origin);if(base.protocol!=='https:'||base.username||base.password)throw Error('Public HTTPS origin required');
 const db=await pool.connect();let held=false;
 try{held=Number((await db.query('SELECT GET_LOCK($1,10) AS acquired',['did-order-'+order.id])).rows[0]?.acquired)===1;if(!held)throw Error('DID provisioning busy');
 const o=(await db.query("SELECT * FROM did_shop_orders WHERE id=$1 AND tenant_id=$2 AND status='active' AND rental_until>UTC_TIMESTAMP(3)",[order.id,order.tenant_id])).rows[0];if(!o)throw Error('Paid active DID required');
 const path='/numbers/'+o.number_e164.slice(1),number=await provider(db,o.tenant_id,path);if('+'+String(number.data?.id||number.data?.attributes?.value||'').replace(/^\+/,'')!==o.number_e164)throw Error('Carrier ownership not confirmed');
 const expected='sip:did-'+o.route_token+'@'+base.host,alias='did-'+o.id,routes=await provider(db,o.tenant_id,'/routes?limit=200');
 let route=(routes.data||[]).find(r=>r.attributes?.alias===alias&&r.attributes?.value===expected);
 if(!route&&o.provider_route_id)throw Error('Saved carrier route needs ownership review');
 if(!route)route=(await provider(db,o.tenant_id,'/routes',{method:'POST',body:{data:{type:'route',attributes:{alias,route_type:'uri',value:expected}}}}))?.data;
 if(!/^[a-zA-Z0-9_-]{1,64}$/.test(String(route?.id||'')))throw Error('Carrier route not confirmed');
 await db.query('UPDATE did_shop_orders SET provider_route_id=$1 WHERE id=$2',[String(route.id),o.id]);
 if(String(number.data?.relationships?.primary_route?.data?.id)!==String(route.id))await provider(db,o.tenant_id,path+'/relationships/primary_route',{method:'PATCH',body:{data:{type:'route',id:String(route.id)}}});
 const check=await provider(db,o.tenant_id,path);if(String(check.data?.relationships?.primary_route?.data?.id)!==String(route.id))throw Error('Carrier route verification pending');
 return {verified:true};
 }finally{if(held)await db.query('SELECT RELEASE_LOCK($1)',['did-order-'+order.id]);db.release();}
}
export async function provisionFlowroute(pool,{provider=flowrouteRequest,billing=configureDidBilling,purchase=provisionDidOrder,voice=ensureDidVoiceRoute,sms=provisionDidSms}={}){
 const report={tenants:[],processedOrders:0,voiceVerified:0,smsReady:0,smsPending:0,reviewRequired:0};
 const tenants=(await pool.query("SELECT DISTINCT t.id FROM tenants t JOIN users u ON u.tenant_id=t.id WHERE t.status='active' AND u.role='super_admin' AND u.status='active' ORDER BY t.id")).rows;
 for(const tenant of tenants){const t={tenantId:tenant.id,credentials:'pending',recurringBilling:'pending'};report.tenants.push(t);
 try{await provider(pool,tenant.id,'/numbers?limit=1');t.credentials='verified';}catch{t.credentials='configuration_required';report.reviewRequired++;continue;}
 try{await billing(pool,tenant.id);t.recurringBilling='configured';}catch{t.recurringBilling='configuration_required';report.reviewRequired++;}
 const pending=(await pool.query("SELECT id FROM did_shop_orders WHERE tenant_id=$1 AND status IN ('payment_confirmed','purchased','route_pending','purchase_started') ORDER BY created_at",[tenant.id])).rows;
 for(const order of pending){try{await purchase(pool,order.id);report.processedOrders++;}catch{report.reviewRequired++;}}
 const active=(await pool.query("SELECT id,tenant_id FROM did_shop_orders WHERE tenant_id=$1 AND status='active' AND rental_until>UTC_TIMESTAMP(3) ORDER BY created_at",[tenant.id])).rows;
 for(const order of active){try{await voice(pool,order);report.voiceVerified++;}catch{report.reviewRequired++;continue;}
 await pool.query('INSERT IGNORE INTO did_sms_settings(order_id,token) VALUES($1,$2)',[order.id,randomBytes(32).toString('hex')]);
 const settings=(await pool.query('SELECT enabled,status FROM did_sms_settings WHERE order_id=$1',[order.id])).rows[0];
 if(Number(settings?.enabled)&&!['starting','activation_unknown'].includes(settings?.status))await sms(pool,order.id);
 const state=(await pool.query('SELECT enabled,status FROM did_sms_settings WHERE order_id=$1',[order.id])).rows[0];
 if(!Number(state?.enabled))continue;if(state.status==='ready')report.smsReady++;else if(['review','starting','activation_unknown'].includes(state.status))report.reviewRequired++;else report.smsPending++;
 }
 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const {createDatabase}=await import('./db.js');const pool=createDatabase(process.env.MYSQL_URL);try{const report=await provisionFlowroute(pool);console.log(JSON.stringify(report));if(report.reviewRequired)process.exitCode=2;}catch{console.error('Flowroute provisioning could not complete. Review private gateway configuration and installed schema.');process.exitCode=1;}finally{await pool.end();}}
