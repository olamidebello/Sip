import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
let bundle;
export async function appFixture({url="https://sip.example.com",navigationExtras=null}={}){
  if(!bundle){const path=new URL('./src/main.js',import.meta.url);const source=await readFile(path,'utf8');
    const result=await build({stdin:{contents:source+'\nwindow.audit={signedIn,showWorkspace,updateNavigation,pageRoutes,resetWorkspace,localeSettings};',resolveDir:new URL('./src/',import.meta.url).pathname},bundle:true,format:'iife',define:{'import.meta.url':JSON.stringify('https://sip.example.com/assets/audit.js')},write:false,loader:{'.css':'empty'},logLevel:'silent'});bundle=result.outputFiles[0].text;}
  const dom=new JSDOM('<div id="app"></div>',{url,runScripts:'outside-only',pretendToBeVisual:true});
  const window=dom.window,registrations=new WeakMap(),calls=[];
  const original=window.EventTarget.prototype.addEventListener;
  window.EventTarget.prototype.addEventListener=function(type,...args){if(!registrations.has(this))registrations.set(this,new Set());registrations.get(this).add(type);return original.call(this,type,...args);};
  window.CSS={escape:value=>value};window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
  window.matchMedia=()=>({matches:false,addEventListener(){}});window.navigator.mediaDevices={enumerateDevices:async()=>[]};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.fetch=async(path,options={})=>{
    calls.push({path,options});let data={error:'Test backend unavailable'},status=401;
    if(path==='/api/admin/telecom/features'){status=200;data={features:[{id:'fax',implementation:'external_dependency',detail:'Fax engine integration is required.'}]};}
    if(path==='/api/navigation'){status=200;data={extras:navigationExtras??Object.fromEntries(['money','dashboard','campaign-inbox-panel','planner','search-panel','external-sms','outbound-rates','meetings','agent-panel','product-store','billing','dialplan-marketplace','geo','activity-monitor'].map(key=>[key,true]))};}
    if(path==='/api/locales/catalog'){status=200;data={languages:[{code:'en',name:'English'}],countries:[{code:'US',name:'United States'}],currencies:[{code:'USD',name:'US Dollar'}]};}
    if(path==='/api/locales'){status=200;data={effective:{language:'en',country:'US',currency:'USD'},tenant:{language:'en',country:'US',currency:'USD'}};}
    if(path.includes('/activity/events')){status=200;data={events:[],scope:path.includes('/admin/')?'tenant':'self',retentionDays:90};}
    return {ok:status<400,status,json:async()=>data};
  };
  window.eval(bundle);await new Promise(resolve=>setTimeout(resolve,10));
  return {window,document:window.document,calls,registrations,close:()=>window.close(),
    async signIn(role='super_admin'){window.audit.signedIn({id:'audit-user',tenant_id:'audit-tenant',tenantId:'audit-tenant',name:'Audit',role,authSource:'local',features:{billing:true,messaging:true,meetings:true,call_center:true}});await new Promise(resolve=>setTimeout(resolve,10));}};
}
