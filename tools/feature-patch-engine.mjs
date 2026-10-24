// Parser-only JSON-lines worker. Application code is never evaluated.
import {parse,tokenizer} from './vendor/acorn/acorn.mjs';
import {createInterface} from 'node:readline';
const options={ecmaVersion:'latest',sourceType:'module',allowAwaitOutsideFunction:true};
function fail(code){throw Object.assign(new Error(code),{code});}
function walk(node,fn){if(!node||typeof node!=='object')return;fn(node);for(const [key,value]of Object.entries(node)){if(['start','end','loc'].includes(key))continue;if(Array.isArray(value))for(const item of value)walk(item,fn);else if(value&&typeof value==='object')walk(value,fn);}}
function find(node,predicate){const result=[];walk(node,n=>{if(predicate(n))result.push(n);});return result;}
const namedCall=(n,name)=>n.type==='CallExpression'&&n.callee.type==='Identifier'&&n.callee.name===name;
function tokens(text){return [...tokenizer(text,options)].filter(t=>t.type.label!=='eof').map(t=>({start:t.start,end:t.end,key:JSON.stringify([t.type.label,t.type.label==='regexp'?[t.value.pattern,t.value.flags]:typeof t.value==='bigint'?{bigint:t.value.toString()}:t.value??null])}));}
function positions(text,fragment){const a=tokens(text),b=tokens(fragment);if(!b.length)fail('empty_pattern');const out=[];for(let i=0;i+b.length<=a.length;i++){if(b.every((t,j)=>t.key===a[i+j].key))out.push({start:a[i].start,end:a[i+b.length-1].end});}return out;}
function once({text,old,new:replacement}){let matches=positions(text,replacement);if(matches.length===1)return text;if(matches.length>1)fail('duplicate_integration');matches=positions(text,old);if(matches.length!==1)fail(matches.length?'ambiguous_pattern':'unknown_pattern');return text.slice(0,matches[0].start)+replacement.trimStart()+text.slice(matches[0].end);}
const marker='// SIP_FEATURE_ROUTER_V2';
function server(text){
 let ast;try{ast=parse(text,options);}catch{fail('server_syntax');}
 if(text.includes(marker)){
  if(text.split(marker).length!==2)fail('duplicate_router');
  for(const name of ['adminRouteAllowed','handleQuickSignup','scopedAdminUser'])if(!find(ast,n=>namedCall(n,name)).length)fail('incomplete_router');
  return text;
 }
 const handlers=find(ast,n=>n.type==='FunctionDeclaration'&&n.id?.name==='handler');
 if(handlers.length!==1||handlers[0].params.map(p=>p.name).join(',')!=='req,res')fail('server_handler');
 const handler=handlers[0];
 const tries=handler.body.body.filter(n=>n.type==='TryStatement'&&find(n.block,n=>n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.object.name==='requestLimiter'&&n.callee.property.name==='check').length);
 if(tries.length!==1)fail('server_rate_boundary');
 const processing=tries[0],rates=processing.block.body.filter(n=>find(n,c=>c.type==='CallExpression'&&c.callee.type==='MemberExpression'&&c.callee.object.name==='requestLimiter'&&c.callee.property.name==='check').length);
 if(rates.length!==1)fail('server_rate_boundary');
 const prefix=handler.body.body.filter(n=>n.end<=processing.start);
 const originGuard=prefix.some(n=>n.type==='IfStatement'&&find(n.test,c=>c.type==='MemberExpression'&&c.property.name==='origin').length&&find(n.consequent,c=>namedCall(c,'send')&&c.arguments[1]?.value===403).length);
 if(!originGuard)fail('server_origin_guard');
 const authenticated=processing.block.body.filter(n=>n.type==='IfStatement'&&n.consequent.type==='BlockStatement'&&find(n.test,c=>c.type==='Literal'&&typeof c.value==='string'&&['/api/admin','/api/admin/'].includes(c.value)).length&&n.consequent.body.some(s=>s.type==='VariableDeclaration'&&s.declarations.some(d=>d.id.name==='user'&&d.init?.type==='AwaitExpression'&&namedCall(d.init.argument,'currentUser'))));
 if(authenticated.length!==1)fail('server_authenticated_router');
 const declarations=authenticated[0].consequent.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).filter(d=>d.id.name==='user'&&d.init?.type==='AwaitExpression'&&namedCall(d.init.argument,'currentUser'));
 if(declarations.length!==1)fail('server_authenticated_user');
 const calls=find(handler,n=>namedCall(n,'handleFlowrouteWebhook'));
 if(calls.length!==1||calls[0].arguments[0]?.type!=='ObjectExpression')fail('server_sms_dispatch');
 const edits=[];const add=(start,end,value)=>edits.push({start,end,value});
 const imports=[['./quickSignup.js',['handleQuickSignup','handleQuickProfile']],['./adminGroup.js',['adminRouteAllowed','scopedAdminUser','handleAdminGroup','adminGroupPolicy']]];
 let header='';
 for(const [module,names]of imports){const missing=[];for(const name of names){const bindings=ast.body.filter(n=>n.type==='ImportDeclaration').flatMap(n=>n.specifiers.filter(s=>s.local.name===name).map(s=>({module:n.source.value,s})));if(bindings.length){if(bindings.length!==1||bindings[0].module!==module||bindings[0].s.imported?.name!==name)fail('server_import_binding');}else missing.push(name);}if(missing.length)header+=`import {${missing.join(',')}} from '${module}';\n`;}
 if(header)add(0,0,header);
 const object=calls[0].arguments[0];if(!object.properties.some(p=>(p.key?.name??p.key?.value)==='origin'))add(object.end-1,object.end-1,object.properties.length?',origin':'origin');
 const init=declarations[0].init;
 add(init.start,init.end,'await currentUser(req).then(featureUser=>featureUser?scopedAdminUser(pool,featureUser,path):null)');
 const routing=`
    ${marker}
    if(path.startsWith('/api/admin/')){
      const principal=await currentUser(req);
      if(!principal)return send(res,401,{error:'Sign in required'});
      if(principal.must_change_password||principal.passkeyGate)return send(res,403,{error:'Complete account security requirements before administration'});
      if(!await adminRouteAllowed(pool,principal,path,req.method))return send(res,403,{error:'Super Admin or a delegated Admin permission required'});
    }
    if(path.startsWith('/api/register/quick/'))return await handleQuickSignup({req,res,path,pool,send,readJson,origin});
    if(path==='/api/account/quick-profile'||path==='/api/account/admin-access'||path.startsWith('/api/admin/system-admin-group')){
      const principal=await currentUser(req);
      if(!principal)return send(res,401,{error:'Sign in required'});
      if(principal.must_change_password)return send(res,403,{error:'Change your temporary password before continuing'});
      if(principal.passkeyGate)return send(res,403,{error:'Complete the required passkey sign-in before continuing'});
      if(path==='/api/account/quick-profile')return await handleQuickProfile({req,res,pool,user:principal,send,readJson});
      if(path==='/api/account/admin-access'&&req.method!=='GET')return send(res,405,{error:'GET required'});
      if(path==='/api/account/admin-access')return send(res,200,{role:principal.role,policy:principal.role==='admin'?await adminGroupPolicy(pool,principal.tenant_id):null});
      return await handleAdminGroup({req,res,path,pool,user:principal,send,readJson,meetingSignaling});
    }
`;
 add(rates[0].end,rates[0].end,routing);
 edits.sort((a,b)=>b.start-a.start);
 for(let i=1;i<edits.length;i++)if(edits[i].end>edits[i-1].start)fail('overlapping_server_edits');
 for(const e of edits)text=text.slice(0,e.start)+e.value+text.slice(e.end);
 try{parse(text,options);}catch{fail('patched_server_syntax');}
 return text;
}
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{const request=JSON.parse(line);const text=request.operation==='server'?server(request.text):once(request);process.stdout.write(JSON.stringify({ok:true,text})+'\n');}
 catch(error){process.stdout.write(JSON.stringify({ok:false,code:/^[a-z_]+$/.test(error.code||'')?error.code:'parser_failure'})+'\n');}
}
