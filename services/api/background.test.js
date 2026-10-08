import test from "node:test";
import assert from "node:assert/strict";
import { validateBackground,handleBackground } from "./background.js";

const config={dayPreset:"ocean",nightPreset:"midnight",schedule:true,animate:false};
const send=(_res,status,body)=>({status,body});

test("background settings accept only known presets and switches",()=>{
  assert.deepEqual(validateBackground(config),{...config,colorStart:'#071b36',colorEnd:'#0c4861',angle:135});
  assert.throws(()=>validateBackground({...config,dayPreset:"url(https://example.com)"}),TypeError);
  assert.throws(()=>validateBackground({...config,customCss:"*{display:none}"}),TypeError);
  assert.equal(validateBackground({...config,dayPreset:'custom',colorStart:'#102030',colorEnd:'#112233',angle:90}).angle,90);
  assert.throws(()=>validateBackground({...config,dayPreset:'custom',colorStart:'#ffffff'}),TypeError);
});

test("tenant policy blocks ordinary user override but admin can save policy",async()=>{
  let writes=0;
  const pool={query:async(sql,params)=>{
    if(sql.includes("SELECT allow_user_override"))return {rows:[{allow_user_override:0}],rowCount:1};
    writes++;assert.equal(params[0],"tenant-a");return {rows:[],rowCount:1};
  }};
  const user={id:"person",role:"user",tenant_id:"tenant-a"};
  const blocked=await handleBackground({req:{method:"PUT"},res:{},path:"/api/background",user,pool,send,readJson:async()=>config});
  assert.equal(blocked.status,403);assert.equal(writes,0);
  const denied=await handleBackground({req:{method:"PUT"},res:{},path:"/api/admin/background",user,pool,send,readJson:async()=>({config,allowUserOverride:false})});
  assert.equal(denied.status,403);
});

test("effective background ignores saved user choice when locked",async()=>{
  const pool={query:async(sql)=>sql.includes("tenant_backgrounds")?
    {rows:[{config:JSON.stringify(config),allowUserOverride:0}]}:
    {rows:[{config:JSON.stringify({...config,dayPreset:"aurora"})}]}};
  const result=await handleBackground({req:{method:"GET"},res:{},path:"/api/background",
    user:{id:"person",role:"user",tenant_id:"tenant-a"},pool,send});
  assert.equal(result.body.effective.dayPreset,"ocean");
  assert.equal(result.body.canOverride,false);
});
