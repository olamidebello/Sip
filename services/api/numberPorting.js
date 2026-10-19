import {randomUUID,createHash} from 'node:crypto';
import {providerCredentials,masterKey,seal,unseal} from './providerCredentials.js';

const base='/api/account/number-porting';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const terminal=new Set(['completed','canceled','abandoned','hard_canceled']);
const statuses=new Set(['pending','processing','submitted','accepted','rejected','review',...terminal]);
const idOk=v=>/^[0-9]{1,32}$/.test(String(v||''));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const publicRow=r=>({id:r.id,number:r.number_e164,status:r.status,carrierStatus:r.carrier_status,
  providerOrderId:r.provider_order_id,documentUploaded:!!r.document_uploaded,
  lastError:r.last_error,createdAt:r.created_at,updatedAt:r.updated_at,
  nextStep:r.status==='awaiting_loa'?'Review and sign the carrier LOA':r.status==='completed'?'Port completed; routing activation is available through your administrator':null});
const secretOf=r=>unseal(r.payload_cipher,masterKey(),r.tenant_id,'number-porting:'+r.id);
const encrypt=(r,p)=>seal(p,masterKey(),r.tenant_id,'number-porting:'+r.id);
const text=(b,k,max=150)=>{if(typeof b[k]!=='string'||!b[k].trim()||b[k].length>max||/[\x00-\x1f]/.test(b[k]))throw fail('Valid '+k.replaceAll('_',' ')+' required');return b[k].trim();};
export function validatePortDraft(b){
 const number=text(b,'number',16);if(!/^\+1[2-9]\d{9}$/.test(number))throw fail('Enter a US or Canadian number in +1 format');
 const out={number};for(const k of ['billing_name','provider','provider_account','street','city','state','zip','country','usage_type'])out[k]=text(b,k);
 if(!['US','CA'].includes(out.country)||!['Residential','Business'].includes(out.usage_type)||!/^[A-Z]{2}$/.test(out.state))throw fail('US/CA, state/province and usage type required');
 if(out.usage_type==='Business')out.company=text(b,'company');
 for(const k of ['street2','pin','billing_number','desired_completion_date'])if(b[k])out[k]=text(b,k,k==='pin'?64:150);
 if(out.billing_number&&!/^\+1[2-9]\d{9}$/.test(out.billing_number))throw fail('Billing number must use +1 format');
 if(out.desired_completion_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(out.desired_completion_date)||!Number.isFinite(Date.parse(out.desired_completion_date))||Date.parse(out.desired_completion_date)<=Date.now()))throw fail('Choose a future completion date');
 if(b.authorized!==true)throw fail('Confirm that you are authorized to transfer this number');
 return {...out,authorizedAt:new Date().toISOString()};
}
export function validatePortDocument(b){
 if(typeof b.content!=='string'||b.content.length>7_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.content))throw fail('Upload a PDF, PNG or JPEG up to 5 MB');
 const bytes=Buffer.from(b.content,'base64');if(!bytes.length||bytes.length>5*1024*1024||bytes.toString('base64')!==b.content)throw fail('Invalid document encoding or size');
 const mime=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':null;
 if(!mime)throw fail('Only PDF, PNG and JPEG documents are supported');
 return {content:b.content,mime,filename:'carrier-bill.'+({'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'}[mime])};
}
export function validPortUploadUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^[a-z0-9.-]+\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(u.hostname);}catch{return false;}}
export function carrierOrderId(data){
 const d=data?.data;if(d?.type==='portorder'&&idOk(d.id))return String(d.id);
 const orders=d?.relationships?.portorders?.data;
 if(!Array.isArray(orders)||orders.length!==1||orders[0].type!=='portorder'||!idOk(orders[0].id))throw fail('Carrier response needs administrator reconciliation',502);
 return String(orders[0].id);
}
export async function portingApi(pool,tenant,path,{body,fetchImpl=fetch}={}){
 if(!/^\/portorders(?:\/(?:portability|[0-9]{1,32})(?:\/(?:loa|status|upload_file))?)?$/.test(path))throw fail('Unsupported porting operation');
 const stored=await providerCredentials(pool,tenant,'flowroute');if(stored?.disabled)throw fail('Flowroute credentials are disabled',503);
 const access=stored?.accessKey||process.env.FLOWROUTE_ACCESS_KEY,secret=stored?.secretKey||process.env.FLOWROUTE_SECRET_KEY;
 if(!access||!secret)throw fail('Configure Flowroute API credentials first',503);
 const r=await fetchImpl('https://api.flowroute.com/v2'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(access+':'+secret).toString('base64'),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok){const e=fail('Flowroute returned HTTP '+r.status+'. Contact support if this persists.',502);e.providerStatus=r.status;throw e;}
 const raw=await r.text();return raw?JSON.parse(raw):null;
}
export async function migrateNumberPorting(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS number_porting_requests (
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
 request_key CHAR(36) NOT NULL,number_e164 VARCHAR(16) NOT NULL UNIQUE,
 payload_cipher LONGBLOB NOT NULL,status VARCHAR(32) NOT NULL DEFAULT 'draft',
 provider_order_id VARCHAR(32) NULL UNIQUE,carrier_status VARCHAR(32) NULL,
 document_uploaded BOOLEAN NOT NULL DEFAULT FALSE,last_error VARCHAR(255) NULL,
 next_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id),
 UNIQUE KEY port_request_once(tenant_id,user_id,request_key),INDEX port_worker(status,next_at)) ENGINE=InnoDB`);
}
async function owned(pool,user,id){if(!uuid.test(id))throw fail('Invalid port request');const r=(await pool.query('SELECT * FROM number_porting_requests WHERE id=$1 AND tenant_id=$2 AND user_id=$3',[id,user.tenant_id,user.id])).rows[0];if(!r)throw fail('Port request not found',404);return r;}
async function lock(pool,id,fn){const db=await pool.connect();let held=false;try{held=Number((await db.query('SELECT GET_LOCK($1,0) AS acquired',['porting-'+id])).rows[0]?.acquired)===1;if(!held)throw fail('Port request is busy; refresh shortly',409);return await fn(db);}finally{if(held)await db.query('SELECT RELEASE_LOCK($1)',['porting-'+id]);db.release();}}
const update=async(db,r,status,error=null)=>{await db.query('UPDATE number_porting_requests SET status=$1,last_error=$2,next_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE id=$3',[status,error,r.id]);r.status=status;};
export async function processPortRequest(pool,id,{api=portingApi,fetchImpl=fetch}={}){
 return lock(pool,id,async db=>{
  const r=(await db.query('SELECT r.* FROM number_porting_requests r JOIN users u ON u.id=r.user_id AND u.tenant_id=r.tenant_id JOIN tenants t ON t.id=r.tenant_id WHERE r.id=$1 AND u.status=\'active\' AND t.status=\'active\'',[id])).rows[0];if(!r)return;
  if(['submitting','submission_unknown','loa_submitting','loa_unknown'].includes(r.status))return;
  if(r.status==='queued'){
   const p=secretOf(r);const check=await api(pool,r.tenant_id,'/portorders/portability',{body:{numbers:[r.number_e164]}});
   if(!check?.data?.portable?.includes(r.number_e164)){await update(db,r,'not_portable','Carrier did not confirm portability');return;}
   // Persist before the non-idempotent carrier call. Ambiguous outcomes must never be automatically replayed.
   await update(db,r,'submitting');
   try{
    const attrs={};for(const k of ['billing_name','provider','provider_account','street','street2','city','state','zip','country','usage_type','company','pin','billing_number','desired_completion_date'])if(p[k])attrs[k]=p[k];
    const created=await api(pool,r.tenant_id,'/portorders',{body:{data:{attributes:{...attrs,numbers:[r.number_e164],alias:'Olamide port '+r.id}}}});
    const orderId=carrierOrderId(created);
    await db.query("UPDATE number_porting_requests SET provider_order_id=$1,status='awaiting_documents',last_error=NULL WHERE id=$2",[orderId,r.id]);r.provider_order_id=orderId;r.status='awaiting_documents';
   }catch(e){await update(db,r,'submission_unknown','Carrier order creation needs support reconciliation; do not create another request');return;}
  }
  if(r.status==='awaiting_documents'){
   const p=secretOf(r);if(!p.document)return;
   const upload=await api(pool,r.tenant_id,'/portorders/'+r.provider_order_id+'/upload_file',{body:{filename:p.document.filename}});
   const url=upload?.data?.attributes?.url;if(!validPortUploadUrl(url))throw fail('Carrier returned an unexpected document destination',502);
   const response=await fetchImpl(url,{method:'PUT',headers:{'Content-Type':p.document.mime},body:Buffer.from(p.document.content,'base64'),redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw fail('Carrier document upload failed',502);
   delete p.document;
   await db.query("UPDATE number_porting_requests SET document_uploaded=TRUE,payload_cipher=$1,status='awaiting_loa',last_error=NULL WHERE id=$2",[encrypt(r,p),r.id]);r.status='awaiting_loa';
  }
  if(r.status==='loa_queued'){
   const p=secretOf(r),loa=await api(pool,r.tenant_id,'/portorders/'+r.provider_order_id+'/loa');
   if(hash(loa)!==p.loaHash){await update(db,r,'awaiting_loa','Carrier LOA changed; review and sign again');return;}
   const body=structuredClone(loa);body.data.attributes.signature_name=p.signatureName;body.data.attributes.signature_title=p.signatureTitle;
   await update(db,r,'loa_submitting');
   try{await api(pool,r.tenant_id,'/portorders/'+r.provider_order_id+'/loa',{body});await update(db,r,'processing');}
   catch{await update(db,r,'loa_unknown','LOA submission needs support reconciliation before retrying');return;}
  }
  if(r.provider_order_id&&!terminal.has(r.status)&&!['awaiting_documents','awaiting_loa'].includes(r.status)){
   const result=await api(pool,r.tenant_id,'/portorders/'+r.provider_order_id+'/status');const state=String(result?.data?.attributes?.status||'').toLowerCase();
   if(!statuses.has(state))throw fail('Unknown carrier status; administrator review required',502);
   await db.query('UPDATE number_porting_requests SET carrier_status=$1,status=$2,last_error=$3,next_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE id=$4',[state,state,state==='rejected'?'Carrier rejected this request; contact support to correct the existing order':null,r.id]);
  }
 });
}
export function startNumberPorting(pool){
 let busy=false,stopped=false,timer;
 async function tick(){if(stopped||busy)return;busy=true;try{if(masterKey()){
  const rows=await pool.query("SELECT id FROM number_porting_requests WHERE status IN ('queued','awaiting_documents','loa_queued','processing','submitted','accepted','review','pending','rejected') AND next_at<=UTC_TIMESTAMP(3) ORDER BY next_at LIMIT 10");
  for(const r of rows.rows){try{await processPortRequest(pool,r.id);}catch{await pool.query("UPDATE number_porting_requests SET last_error='Carrier connection or processing unavailable; status will be checked again',next_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE id=$1",[r.id]);}}
 }}catch{console.error('Number porting worker unavailable');}finally{busy=false;if(!stopped){timer=setTimeout(tick,30000);timer.unref?.();}}}
 timer=setTimeout(tick,3000);timer.unref?.();return()=>{stopped=true;clearTimeout(timer);};
}
export async function handleNumberPorting({req,res,path,user,pool,send,readJson,api=portingApi}){
 try{
  if(path.startsWith('/api/admin/number-porting')){
   if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
   if(path==='/api/admin/number-porting'&&req.method==='GET'){
    const rows=await pool.query('SELECT * FROM number_porting_requests WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200',[user.tenant_id]);return send(res,200,{requests:rows.rows.map(publicRow)});
   }
   const m=/^\/api\/admin\/number-porting\/([a-f0-9-]{36})\/reconcile$/i.exec(path);
   if(!m||req.method!=='POST')throw fail('Operation unavailable',404);
   if(!masterKey())throw fail('Provider credential encryption unavailable',503);
   const b=await readJson(req);if(!idOk(b.providerOrderId))throw fail('Carrier order ID required');
   return await lock(pool,m[1],async db=>{
    const r=(await db.query('SELECT * FROM number_porting_requests WHERE id=$1 AND tenant_id=$2',[m[1],user.tenant_id])).rows[0];if(!r)throw fail('Port request not found',404);
    if(!['submitting','submission_unknown','loa_submitting','loa_unknown'].includes(r.status))throw fail('Only uncertain submissions require reconciliation',409);
    const remote=await api(pool,r.tenant_id,'/portorders/'+b.providerOrderId),a=remote?.data?.attributes;
    if(!a||String(remote.data.id)!==String(b.providerOrderId)||a.alias!=='Olamide port '+r.id||!Array.isArray(a.numbers)||a.numbers.length!==1||'+'+String(a.numbers[0]).replace(/^\+/, '')!==r.number_e164)throw fail('Carrier order does not match this request',409);
    const state=String(a.status||'').toLowerCase();if(!statuses.has(state))throw fail('Unknown carrier state',409);
    await db.query('UPDATE number_porting_requests SET provider_order_id=$1,status=$2,carrier_status=$3,last_error=NULL,next_at=UTC_TIMESTAMP(3) WHERE id=$4',[String(b.providerOrderId),state==='pending'?(r.document_uploaded?'awaiting_loa':'awaiting_documents'):state,state,r.id]);return send(res,200,{reconciled:true});
   });
  }
  if(!user.features?.billing)return send(res,403,{error:'Number porting is unavailable for this account'});
  if(req.method==='GET'&&path===base){const rows=await pool.query('SELECT * FROM number_porting_requests WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100',[user.tenant_id,user.id]);return send(res,200,{requests:rows.rows.map(publicRow),configured:!!masterKey()});}
  if(!masterKey())throw fail('Provider credential encryption must be configured before porting',503);
  if(path===base+'/check'&&req.method==='POST'){const b=await readJson(req);if(!/^\+1[2-9]\d{9}$/.test(b.number||''))throw fail('Enter a US or Canadian number in +1 format');const data=await api(pool,user.tenant_id,'/portorders/portability',{body:{numbers:[b.number]}});return send(res,200,{portable:data?.data?.portable?.includes(b.number)===true});}
  if(path===base&&req.method==='POST'){
   const b=await readJson(req);if(!uuid.test(b.requestKey||''))throw fail('Request ID required');const p=validatePortDraft(b);
   const prior=(await pool.query('SELECT * FROM number_porting_requests WHERE tenant_id=$1 AND user_id=$2 AND request_key=$3',[user.tenant_id,user.id,b.requestKey])).rows[0];
   if(prior){if(prior.number_e164!==p.number||Object.keys(p).some(k=>k!=='authorizedAt'&&secretOf(prior)[k]!==p[k]))throw fail('Request ID already used for different account details; refresh and create a new draft',409);return send(res,200,publicRow(prior));}
   const existing=await pool.query('SELECT user_id,tenant_id FROM inhouse_dids WHERE number_e164=$1',[p.number]);if(existing.rows.some(r=>r.user_id!==user.id||r.tenant_id!==user.tenant_id))throw fail('This number is already assigned in the platform',409);
   const r={id:randomUUID(),tenant_id:user.tenant_id,user_id:user.id,number_e164:p.number,status:'draft'};
   await pool.query('INSERT INTO number_porting_requests(id,tenant_id,user_id,request_key,number_e164,payload_cipher) VALUES($1,$2,$3,$4,$5,$6)',[r.id,r.tenant_id,r.user_id,b.requestKey,p.number,encrypt(r,p)]);return send(res,201,publicRow(r));
  }
  const match=new RegExp('^'+base+'/([a-f0-9-]{36})/(document|submit|loa|sign|refresh)$','i').exec(path);if(!match)throw fail('Porting operation not found',404);
  const [,id,action]=match;
  if((action==='loa')&&req.method==='GET'){
   const r=await owned(pool,user,id);if(r.status!=='awaiting_loa')throw fail('LOA is not ready for signing',409);
   const loa=await api(pool,user.tenant_id,'/portorders/'+r.provider_order_id+'/loa');if(!loa?.data?.attributes?.loa_copy)throw fail('Carrier LOA unavailable',502);
   return send(res,200,{text:loa.data.attributes.loa_copy,hash:hash(loa),number:r.number_e164});
  }
  if(req.method!=='POST')throw fail('Method unavailable',405);
  return await lock(pool,id,async db=>{
   const r=await owned(db,user,id),p=secretOf(r);
   if(action==='document'){
    if(!['draft','awaiting_documents'].includes(r.status))throw fail('Documents cannot be changed at this stage',409);
    const b=await readJson(req,7_100_000);p.document=validatePortDocument(b);
    await db.query('UPDATE number_porting_requests SET payload_cipher=$1,next_at=UTC_TIMESTAMP(3) WHERE id=$2',[encrypt(r,p),r.id]);return send(res,200,{uploaded:true});
   }
   if(action==='submit'){
    if(r.status!=='draft')return send(res,200,publicRow(r));if(!p.document)throw fail('Upload a recent carrier bill first');
    const b=await readJson(req);if(b.confirmTransfer!==true)throw fail('Confirm transfer authorization and possible carrier charges');
    p.submittedAt=new Date().toISOString();await db.query("UPDATE number_porting_requests SET payload_cipher=$1,status='queued',next_at=UTC_TIMESTAMP(3) WHERE id=$2",[encrypt(r,p),r.id]);return send(res,202,{id,status:'queued'});
   }
   if(action==='sign'){
    if(r.status!=='awaiting_loa')throw fail('LOA cannot be signed at this stage',409);const b=await readJson(req);
    if(b.authorize!==true||!/^[a-f0-9]{64}$/.test(b.hash||''))throw fail('Review and authorize the current carrier LOA');
    p.signatureName=text(b,'signatureName');p.signatureTitle=text(b,'signatureTitle');p.loaHash=b.hash;p.signedAt=new Date().toISOString();
    await db.query("UPDATE number_porting_requests SET payload_cipher=$1,status='loa_queued',next_at=UTC_TIMESTAMP(3) WHERE id=$2",[encrypt(r,p),r.id]);return send(res,202,{status:'loa_queued'});
   }
   if(action==='refresh'){await db.query('UPDATE number_porting_requests SET next_at=UTC_TIMESTAMP(3) WHERE id=$1',[id]);return send(res,202,{queued:true});}
   throw fail('Operation unavailable',404);
  });
 }catch(e){if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'A port request for this number already exists; resume that request or contact support'});return send(res,e.status||500,{error:e.status?e.message:'Number porting is unavailable; contact support'});}
}
