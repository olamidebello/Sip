import test from 'node:test';import assert from 'node:assert/strict';import {validateReportSchedule,enqueueDueReport,processReportRun,handleTelecomReports} from './telecomReports.js';
const id='00000000-0000-4000-8000-000000000001';
test('report schedules enforce bounded interval and completed-day reporting period',()=>{
 const b={name:'Daily',intervalHours:24,lookbackDays:1,nextAt:'2026-10-20T00:00:00.000Z',enabled:true};assert.equal(validateReportSchedule(b),b);
 for(const bad of [{intervalHours:0},{lookbackDays:32},{nextAt:'2026-02-30T00:00:00.000Z'},{enabled:1}])assert.throws(()=>validateReportSchedule({...b,...bad}));
});
test('scheduler locks one due record and creates an idempotent durable run before advancing',async()=>{
 const calls=[],db={release(){},async query(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT s.*'))return {rows:[{id,tenant_id:'tenant',next_at:'2026-10-15 00:00:00'}]};return {rows:[],rowCount:1};}};
 assert.equal(await enqueueDueReport({connect:async()=>db}),true);assert.match(calls[1].sql,/FOR UPDATE SKIP LOCKED/);assert.ok(calls.some(c=>c.sql.startsWith('INSERT IGNORE')));assert.equal(calls.at(-1).sql,'COMMIT');
});
test('report delivery uses persisted payload and stable provider idempotency; a disabled creator cancels delivery',async()=>{
 const saved={key:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM};process.env.RESEND_API_KEY='test';process.env.RESEND_FROM='sender@example.test';
 try{for(const active of [false,true]){
  const calls=[],job={id,schedule_id:id,tenant_id:'tenant',actor_id:'actor',name:'Daily',attempts:0,created_at:new Date(),due_at:new Date(),payload:{calls:{total:3}}};
  const query=async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT r.*'))return {rows:[job]};if(sql.startsWith('SELECT u.email'))return {rows:active?[{email:'actor@example.test'}]:[]};return {rows:[],rowCount:1};};const pool={connect:async()=>({query,release(){}}),query};let sent=0;
  await processReportRun(pool,{fetchImpl:async(url,options)=>{sent++;assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],'telecom-report/'+id);assert.deepEqual(JSON.parse(options.body).to,['actor@example.test']);return {ok:true,json:async()=>({id:'provider-result'})};}});
  assert.equal(sent,active?1:0);const update=calls.find(c=>c.sql.startsWith('UPDATE telecom_report_runs SET status=$1'));assert.equal(update.args[0],active?'accepted':'cancelled');assert.match(update.sql,/lease_token/);
 }}finally{for(const [env,v] of [['RESEND_API_KEY',saved.key],['RESEND_FROM',saved.from]])if(v===undefined)delete process.env[env];else process.env[env]=v;}
});
test('transient mail failure remains retryable and attempts are bounded',async()=>{
 const calls=[],query=async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT r.*'))return {rows:[{id,schedule_id:id,tenant_id:'tenant',actor_id:'actor',attempts:4,created_at:new Date(),payload:{ready:true}}]};if(sql.startsWith('SELECT u.email'))return {rows:[{email:'actor@example.test'}]};return {rows:[]};};
 await processReportRun({query,connect:async()=>({query,release(){}})},{fetchImpl:async()=>{throw Error('offline');}});assert.equal(calls.find(c=>c.sql.startsWith('UPDATE telecom_report_runs SET status=$1')).args[0],'failed');
});
test('stored reports cannot be fetched across tenants',async()=>{const calls=[];const result=await handleTelecomReports({req:{method:'GET'},path:'/api/admin/telecom/reports/runs/'+id,user:{role:'super_admin',tenant_id:'tenant-a'},pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:[],rowCount:0};}},send:(_r,status)=>status});assert.equal(result,404);assert.deepEqual(calls[0].args,[id,'tenant-a']);});
