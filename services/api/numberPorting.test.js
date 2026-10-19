import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePortDraft,validatePortDocument,validPortUploadUrl,carrierOrderId,processPortRequest,handleNumberPorting,portingApi} from './numberPorting.js';
import {seal} from './providerCredentials.js';
const tenant='00000000-0000-4000-8000-000000000001',userId='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
const key=Buffer.from('a'.repeat(64),'hex');
const draft={number:'+12125550123',billing_name:'Account Holder',provider:'Current carrier',provider_account:'1234',street:'1 Main St',city:'Dallas',state:'TX',zip:'75001',country:'US',usage_type:'Residential',authorized:true};
const document={mime:'application/pdf',filename:'carrier-bill.pdf',content:Buffer.from('%PDF-1.7\nExample bill').toString('base64')};
function fixture(status='queued',payload={...draft,document}){
 const r={id,tenant_id:tenant,user_id:userId,number_e164:draft.number,status,payload_cipher:seal(payload,key,tenant,'number-porting:'+id),provider_order_id:status==='queued'?null:'12345'};
 const writes=[];const db={release(){},async query(sql,args=[]){writes.push([sql,args]);
  if(sql.includes('GET_LOCK'))return {rows:[{acquired:1}]};
  if(sql.startsWith('SELECT r.*'))return {rows:[{...r}]};
  if(sql.startsWith('UPDATE number_porting_requests SET status=$1'))r.status=args[0];
  if(sql.includes("SET provider_order_id=$1,status='awaiting_documents'")){r.provider_order_id=args[0];r.status='awaiting_documents';}
  if(sql.includes("document_uploaded=TRUE")){r.status='awaiting_loa';r.payload_cipher=args[0];}
  if(sql.includes('SET carrier_status=$1')){r.carrier_status=args[0];r.status=args[1];}
  return {rows:[],rowCount:1};}};return {r,writes,pool:{connect:async()=>db}};
}
test('draft validates ownership confirmation, business details, supported countries and future dates',()=>{
 assert.equal(validatePortDraft(draft).number,draft.number);
 for(const change of [{authorized:false},{country:'NG'},{number:'+442071234567'},{usage_type:'Business'},{state:'texas'},{desired_completion_date:'2000-01-01'}])assert.throws(()=>validatePortDraft({...draft,...change}));
 assert.equal(validatePortDraft({...draft,pin:'123456'}).pin,'123456');
});
test('documents require real file signatures and canonical bounded base64',()=>{
 assert.equal(validatePortDocument(document).mime,'application/pdf');
 assert.throws(()=>validatePortDocument({content:Buffer.from('<script>unsafe</script>').toString('base64')}));
 assert.throws(()=>validatePortDocument({content:'AAAA='}));
 assert.throws(()=>validatePortDocument({content:'a'.repeat(7_000_001)}));
});
test('document destinations exclude arbitrary, insecure and credential-bearing URLs',()=>{
 assert.equal(validPortUploadUrl('https://porting-uploads.s3.amazonaws.com/a.pdf?signature=abc'),true);
 assert.equal(validPortUploadUrl('https://porting-uploads.s3.us-west-2.amazonaws.com/a.pdf'),true);
 for(const url of ['http://porting.s3.amazonaws.com/a','https://example.com/a','https://s3.amazonaws.com.attacker.test/a','https://user:pass@porting.s3.amazonaws.com/a','https://127.0.0.1/a'])assert.equal(validPortUploadUrl(url),false);
});
test('group response must identify exactly one order; split responses require reconciliation',()=>{
 assert.equal(carrierOrderId({data:{type:'portorder_group',relationships:{portorders:{data:[{id:'123',type:'portorder'}]}}}}),'123');
 assert.throws(()=>carrierOrderId({data:{relationships:{portorders:{data:[{id:'1',type:'portorder'},{id:'2',type:'portorder'}]}}}}));
});
test('automatic processing checks portability, creates once and uploads the bill without sending credentials to S3',async()=>{
 process.env.PROVIDER_CREDENTIAL_KEY=key.toString('hex');const f=fixture();let creates=0,uploads=0;
 const api=async(_p,_t,path,{body}={})=>{
  if(path.endsWith('portability'))return {data:{portable:[draft.number]}};
  if(path==='/portorders'){creates++;assert.equal(body.data.attributes.numbers[0],draft.number);return {data:{type:'portorder',id:'12345'}};}
  if(path.endsWith('upload_file'))return {data:{attributes:{url:'https://porting-uploads.s3.amazonaws.com/a.pdf'}}};
  throw Error('Unexpected provider operation');};
 await processPortRequest(f.pool,id,{api,fetchImpl:async(_url,opts)=>{uploads++;assert.equal(opts.headers.Authorization,undefined);assert.equal(opts.redirect,'error');return {ok:true};}});
 assert.equal(f.r.status,'awaiting_loa');assert.equal(creates,1);assert.equal(uploads,1);
 assert.ok(f.writes.some(([sql,args])=>sql.includes('SET status=$1')&&args[0]==='submitting'));
 await processPortRequest(f.pool,id,{api});assert.equal(creates,1);
});
test('ambiguous create is held for reconciliation and never automatically replayed',async()=>{
 process.env.PROVIDER_CREDENTIAL_KEY=key.toString('hex');const f=fixture();let creates=0;
 const api=async(_p,_t,path)=>{if(path.endsWith('portability'))return {data:{portable:[draft.number]}};creates++;throw Error('Connection timed out');};
 await processPortRequest(f.pool,id,{api});assert.equal(f.r.status,'submission_unknown');
 await processPortRequest(f.pool,id,{api});assert.equal(creates,1);
});
test('nonportable numbers never create a carrier order',async()=>{
 process.env.PROVIDER_CREDENTIAL_KEY=key.toString('hex');const f=fixture();let calls=0;
 await processPortRequest(f.pool,id,{api:async()=>{calls++;return {data:{portable:[]}};}});
 assert.equal(f.r.status,'not_portable');assert.equal(calls,1);
});
test('LOA changes require a fresh review, and cannot be signed automatically',async()=>{
 process.env.PROVIDER_CREDENTIAL_KEY=key.toString('hex');const f=fixture('loa_queued',{...draft,loaHash:'old-hash',signatureName:'Name',signatureTitle:'Owner'});let posts=0;
 await processPortRequest(f.pool,id,{api:async(_p,_t,_path,opts)=>{if(opts?.body)posts++;return {data:{attributes:{loa_copy:'Changed carrier terms'}}};}});
 assert.equal(f.r.status,'awaiting_loa');assert.equal(posts,0);
});
test('carrier completion is distinguished from acceptance',async()=>{
 process.env.PROVIDER_CREDENTIAL_KEY=key.toString('hex');for(const state of ['accepted','completed','rejected']){
 const f=fixture('processing',draft);await processPortRequest(f.pool,id,{api:async()=>({data:{attributes:{status:state}}})});assert.equal(f.r.status,state);}
});
test('request reads remain scoped to both tenant and signed-in user',async()=>{
 process.env.PROVIDER_CREDENTIAL_KEY=key.toString('hex');let queried;
 const pool={query:async(sql,args)=>{queried={sql,args};return {rows:[]};}};let result;
 await handleNumberPorting({req:{method:'GET'},res:{},path:'/api/account/number-porting/'+id+'/loa',user:{id:userId,tenant_id:tenant,features:{billing:true}},pool,send:(_r,status,body)=>{result={status,body};}});
 assert.equal(result.status,404);assert.deepEqual(queried.args,[id,tenant,userId]);
});
test('provider client handles empty LOA responses and refuses arbitrary paths',async()=>{
 process.env.FLOWROUTE_ACCESS_KEY='test-access';process.env.FLOWROUTE_SECRET_KEY='test-secret';const pool={query:async()=>({rows:[],rowCount:0})};
 const r=await portingApi(pool,tenant,'/portorders/123/loa',{body:{data:{}},fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.flowroute.com/v2/portorders/123/loa');assert.equal(opts.redirect,'error');return {ok:true,text:async()=>''};}});assert.equal(r,null);
 await assert.rejects(portingApi(pool,tenant,'https://attacker.test/'));
});
test('LOA submits only the reviewed carrier template plus signer fields',async()=>{
 const {createHash}=await import('node:crypto');process.env.PROVIDER_CREDENTIAL_KEY=key.toString('hex');
 const loa={data:{type:'loa',id:'12345',attributes:{loa_copy:'Exact carrier authorization',billing_name:'Account Holder',signature_name:'',signature_title:''}}};
 const loaHash=createHash('sha256').update(JSON.stringify(loa)).digest('hex');
 const f=fixture('loa_queued',{...draft,loaHash,signatureName:'Account Holder',signatureTitle:'Owner'});let submitted;
 await processPortRequest(f.pool,id,{api:async(_p,_t,path,opts)=>{if(path.endsWith('/status'))return {data:{attributes:{status:'processing'}}};if(opts?.body){submitted=opts.body;return null;}return loa;}});
 assert.deepEqual(submitted,{data:{...loa.data,attributes:{...loa.data.attributes,signature_name:'Account Holder',signature_title:'Owner'}}});assert.equal(f.r.status,'processing');assert.equal(loa.data.attributes.signature_name,'');
});
test('request listings do not expose encrypted carrier account details or PINs',async()=>{
 process.env.PROVIDER_CREDENTIAL_KEY=key.toString('hex');const f=fixture();let result;
 await handleNumberPorting({req:{method:'GET'},res:{},path:'/api/account/number-porting',user:{id:userId,tenant_id:tenant,features:{billing:true}},pool:{query:async()=>({rows:[f.r]})},send:(_res,status,body)=>{result={status,body};}});
 assert.equal(result.status,200);assert.equal(result.body.requests[0].payload_cipher,undefined);assert.equal(result.body.requests[0].provider_account,undefined);
});
test('administrative controls refuse ordinary users before database access',async()=>{
 let result;
 await handleNumberPorting({req:{method:'POST'},res:{},path:'/api/admin/number-porting/'+id+'/refresh',user:{id:userId,tenant_id:tenant,role:'user'},pool:{query(){throw Error('Unexpected database access');}},send:(_r,status,body)=>result={status,body}});
 assert.equal(result.status,403);
});
