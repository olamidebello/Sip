import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from 'node:http';
import { once } from "node:events";
import WebSocket from "ws";
import { createHmac } from "node:crypto";
import { createDatabase } from "./db.js";
const cdrTenant = "00000000-0000-4000-8000-000000000000";
const cdrSecret = "integration-only-cdr-secret-" + "x".repeat(32);

test("registered users can create and join a room; host controls it", {
  skip: !process.env.TEST_MYSQL_URL,
  timeout: 30000
}, async (t) => {
  const port = 18080 + Math.floor(Math.random() * 1000);
  const origin = "http://127.0.0.1:5173";
  const base = `http://127.0.0.1:${port}`;
  const codes=new Map();
  const mail=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req) body+=chunk;
    const message=JSON.parse(body);codes.set(message.to[0],/\b\d{6}\b/.exec(message.text)?.[0]);
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{"id":"test-email"}');
  });
  mail.listen(0,'127.0.0.1');await once(mail,'listening');
  t.after(()=>mail.close());
  const server = spawn(process.execPath, ["server.js"], {
    cwd: new URL(".", import.meta.url).pathname,
    env: { ...process.env, MYSQL_URL: process.env.TEST_MYSQL_URL,
      PUBLIC_ORIGIN: origin, API_RATE_LIMIT:"100", LISTEN_ADDR: "127.0.0.1", PORT: String(port),
      CDR_INGEST_KEYS_JSON: JSON.stringify({[cdrTenant]:cdrSecret}),
      RESEND_API_KEY:'test-key',RESEND_FROM:'test@example.com',OTP_HMAC_SECRET:'test-only-secret-'.repeat(4),
      SIP_CREDENTIAL_KEY:'ab'.repeat(32),RESEND_API_URL:`http://127.0.0.1:${mail.address().port}/emails` },
    stdio: ["ignore","pipe","pipe"]
  });
  t.after(() => server.kill());
  let log = "";
  server.stderr.on("data", (chunk) => { log += chunk.toString(); });
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("API startup failed: " + log);
    try {
      const health = await fetch(base + "/api/health");
      if (health.ok) break;
    } catch { /* wait for database initialization */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (i === 59) throw new Error("API did not start: " + log);
  }
  const post = async (path, body, cookie) => {
    const res = await fetch(base + path, { method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body) });
    return { status: res.status, body: await res.json(), cookie: res.headers.get("set-cookie") };
  };
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const password = "meeting-test-password-123";
  for (const name of ["host","guest"]) {
    const email=name+unique+'@example.com';
    assert.equal((await post("/api/register",
      { name,email,password,phone:'+2348012345678',address1:'123 Main St',address2:'',city:'Lagos',region:'Lagos',postalCode:'100001',country:'NG' })).status, 201);
    assert.equal((await post('/api/login',{email,password})).status,401);
    assert.equal((await post('/api/register/verify',{email,code:codes.get(email)})).status,200);
  }
  const hostLogin = await post("/api/login", { email:"host" + unique + "@example.com", password });
  const guestLogin = await post("/api/login", { email:"guest" + unique + "@example.com", password });
  assert.equal(hostLogin.status, 200);
  const hostCookie = hostLogin.cookie.split(";")[0];
  const guestCookie = guestLogin.cookie.split(";")[0];
  assert.equal(guestLogin.body.features.remote_assist, false);
  const created = await post("/api/meetings", { title:"Team call" }, hostCookie);
  assert.equal(created.status, 201, JSON.stringify(created.body) + "\nAPI stderr: " + log);
  const id = created.body.id;
  const socket = (cookie) => new WebSocket(`ws://127.0.0.1:${port}/api/meetings/${id}/socket`,
    { headers: { Origin:origin, Cookie:cookie } });
  const hostWs = socket(hostCookie);
  t.after(() => hostWs.terminate());
  const hostMessages = [];
  hostWs.on("message", (data) => hostMessages.push(JSON.parse(data)));
  await once(hostWs, "open");
  for (let i = 0; i < 20 && !hostMessages.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(hostMessages[0].type, "welcome");
  const guestWs = socket(guestCookie);
  t.after(() => guestWs.terminate());
  const guestMessages = [];
  guestWs.on("message", (data) => guestMessages.push(JSON.parse(data)));
  await once(guestWs, "open");
  guestWs.send(JSON.stringify({ type:"chat", text:"hello" }));
  for (let i = 0; i < 20 && !hostMessages.some((m) => m.type === "chat"); i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(hostMessages.find((m) => m.type === "chat")?.text, "hello");
  const db = createDatabase(process.env.TEST_MYSQL_URL);
  t.after(() => db.end());
  const sip=await db.query('SELECT status FROM sip_accounts WHERE user_id=$1',[hostLogin.body.id]);
  assert.equal(sip.rows[0].status,'awaiting_switch');
  const timezone = await db.query("SELECT @@session.time_zone AS timezone");
  assert.equal(timezone.rows[0].timezone, "+00:00");
  await db.query("UPDATE users SET role='admin' WHERE id=$1", [hostLogin.body.id]);
  const ldapAdmin=await fetch(base+"/api/admin/ldap",{headers:{Cookie:hostCookie}});
  assert.equal((await ldapAdmin.json()).configured,false);
  const ldapEnable=await fetch(base+"/api/admin/ldap",{method:"PUT",
    headers:{Origin:origin,"Content-Type":"application/json",Cookie:hostCookie},
    body:JSON.stringify({enabled:true})});
  assert.equal(ldapEnable.status,409);
  const backgroundConfig={dayPreset:"aurora",nightPreset:"midnight",schedule:true,animate:false};
  const backgroundPolicy=await fetch(base+"/api/admin/background",{method:"PUT",
    headers:{Origin:origin,"Content-Type":"application/json",Cookie:hostCookie},
    body:JSON.stringify({config:backgroundConfig,allowUserOverride:false})});
  assert.equal(backgroundPolicy.status,200);
  const blockedBackground=await fetch(base+"/api/background",{method:"PUT",
    headers:{Origin:origin,"Content-Type":"application/json",Cookie:guestCookie},
    body:JSON.stringify(backgroundConfig)});
  assert.equal(blockedBackground.status,403);
  const guestBackground=await fetch(base+"/api/background",{headers:{Cookie:guestCookie}});
  assert.equal((await guestBackground.json()).effective.dayPreset,"aurora");
  assert.equal((await post("/api/admin/inhouse/numbers",{
    number:"+12031500000",setupCents:500,monthlyCents:200,
    evidenceReference:"test"
  },hostCookie)).status,400);
  const didNumber="+1203250"+String(Math.floor(Math.random()*10000)).padStart(4,"0");
  const staged=await post("/api/admin/inhouse/numbers",{
    number:didNumber,setupCents:500,monthlyCents:200,
    evidenceReference:"Integration test only; no real assignment"
  },hostCookie);
  assert.equal(staged.status,201,JSON.stringify(staged.body));
  const priceRule=await fetch(base+"/api/admin/pricing/inhouse",{method:"PUT",
    headers:{Origin:origin,"Content-Type":"application/json",Cookie:hostCookie},
    body:JSON.stringify({mode:"percent",setupValue:3000,monthlyValue:3000})});
  assert.equal(priceRule.status,200);
  const setDidPrice=await fetch(base+`/api/admin/inhouse/numbers/${staged.body.id}/pricing`,{method:"PUT",
    headers:{Origin:origin,"Content-Type":"application/json",Cookie:hostCookie},
    body:JSON.stringify({buySetupCents:100,buyMonthlyCents:50,priceMode:"rule",sellSetupCents:500,sellMonthlyCents:200})});
  assert.equal(setDidPrice.status,200);
  const unverified=await fetch(base+"/api/inhouse/numbers",{headers:{Cookie:guestCookie}});
  assert.equal((await unverified.json()).numbers.some((did)=>did.number_e164===didNumber),false);
  assert.equal((await post(`/api/admin/inhouse/numbers/${staged.body.id}/publish`,
    {confirmed:true},hostCookie)).status,200);
  const reserved=await post("/api/inhouse/reserve",{number:didNumber},guestCookie);
  assert.equal(reserved.status,201,JSON.stringify(reserved.body));
  assert.equal(reserved.body.setupCents,130);
  assert.equal(reserved.body.monthlyCents,65);
  assert.equal(reserved.body.provisioned,false);
  assert.equal((await post("/api/inhouse/reserve",{number:didNumber},hostCookie)).status,409);
  const myDids=await fetch(base+"/api/inhouse/my-numbers",{headers:{Cookie:guestCookie}});
  assert.equal((await myDids.json()).numbers.some((did)=>did.number_e164===didNumber),true);
  const heldBlocks=await fetch(base+"/api/admin/inhouse/blocks",{headers:{Cookie:hostCookie}});
  assert.equal((await heldBlocks.json()).blocks.length,5);
  const ninStatus=await fetch(base+"/api/nigeria/nin/status",{headers:{Cookie:guestCookie}});
  assert.equal((await ninStatus.json()).verified,false);
  assert.equal((await post("/api/admin/nigeria/peers",{
    name:"Test peer "+unique,peerType:"clearinghouse",host:"peer.example",
    port:5061,transport:"tls",destinationPrefix:"234",agreementReference:"Test only"
  },guestCookie)).status,403);
  const peer=await post("/api/admin/nigeria/peers",{
    name:"Test peer "+unique,peerType:"clearinghouse",host:"peer.example",
    port:5061,transport:"tls",destinationPrefix:"234",agreementReference:"Test only"
  },hostCookie);
  assert.equal(peer.status,201,JSON.stringify(peer.body));
  const preview=await fetch(base+"/api/admin/nigeria/preview?number=%2B2348012345678",
    {headers:{Cookie:hostCookie}});
  assert.equal((await preview.json()).peer.id,peer.body.id);
  const cdr = {tenantId:cdrTenant,source:"integration-switch",legId:unique,
    direction:"outbound",from:"+12125550123",to:"+12125550124",
    disposition:"answered",durationSeconds:60,billableSeconds:55,
    startedAt:new Date().toISOString().replace(/\.\d{3}Z$/,"Z")};
  const ingest = async (record, sign = true) => {
    const raw = JSON.stringify(record), timestamp = String(Math.floor(Date.now()/1000));
    const signature = sign ? createHmac("sha256",cdrSecret).update(timestamp+"."+raw).digest("hex") : "0".repeat(64);
    const response = await fetch(base+"/api/integrations/cdr", {
      method:"POST",headers:{"Content-Type":"application/json",
        "X-CDR-Timestamp":timestamp,"X-CDR-Signature":signature},body:raw
    });
    return {status:response.status,body:await response.json()};
  };
  assert.equal((await ingest(cdr,false)).status,401);
  assert.equal((await ingest(cdr)).status,201);
  assert.equal((await ingest(cdr)).body.duplicate,true);
  assert.equal((await ingest({...cdr,durationSeconds:61})).status,409);
  const cdrAdmin = await fetch(base+"/api/admin/cdr",{headers:{Cookie:hostCookie}});
  assert.equal(cdrAdmin.status,200);
  assert.equal((await cdrAdmin.json()).records.some((record) => record.leg_id === unique),true);
  assert.equal((await fetch(base+"/api/admin/cdr",{headers:{Cookie:guestCookie}})).status,403);
  assert.equal((await post("/api/contacts",
    { email:"guest" + unique + "@example.com" }, hostCookie)).status, 201);
  assert.equal((await post("/api/messages",
    { recipient:guestLogin.body.id, body:"Hello from MySQL" }, hostCookie)).status, 201);
  const thread = await fetch(base + "/api/messages?contact=" + guestLogin.body.id,
    { headers:{ Cookie:hostCookie } });
  assert.equal((await thread.json()).messages[0].body, "Hello from MySQL");
  const plan = await post("/api/admin/plans",
    { name:"Test plan " + unique, monthlyCents:1299 }, hostCookie);
  assert.equal(plan.status, 201);
  assert.equal((await post("/api/billing/select-plan",
    { planId:plan.body.id }, guestCookie)).status, 201);
  const invoices = await fetch(base + "/api/billing/invoices",
    { headers:{ Cookie:guestCookie } });
  assert.equal((await invoices.json()).invoices[0].amount_cents, 1299);
  assert.equal((await post("/api/porting",
    { number:"+12125550123", provider:"flowroute" }, guestCookie)).status, 201);
  assert.equal((await post("/api/admin/markup", { percent:35 }, hostCookie)).status, 200);
  assert.equal((await post("/api/admin/config",
    { sipWssUrl:"wss://sip.example.com" }, hostCookie)).status, 200);
  assert.equal((await post("/api/admin/mobile/apps", {
    platform:"android", appIdentifier:"com.olamide.test" + unique.replace(/[^a-z0-9]/gi,""),
    displayName:"Olamide Test"
  }, guestCookie)).status, 403);
  const mobileApp = await post("/api/admin/mobile/apps", {
    platform:"android", appIdentifier:"com.olamide.test" + unique.replace(/[^a-z0-9]/gi,""),
    displayName:"Olamide Test"
  }, hostCookie);
  assert.equal(mobileApp.status, 201, JSON.stringify(mobileApp.body));
  const mobileRelease = await post("/api/admin/mobile/releases", {
    appId:mobileApp.body.id,versionName:"1.0.0",buildNumber:"1",track:"internal",
    rolloutPercent:100,releaseNotes:"Internal test",artifactUrl:"https://example.com/build.aab",
    artifactSha256:"a".repeat(64)
  }, hostCookie);
  assert.equal(mobileRelease.status, 201, JSON.stringify(mobileRelease.body));
  assert.equal((await post(`/api/admin/mobile/releases/${mobileRelease.body.id}/approve`,
    { revision:1 },hostCookie)).body.status,"approved");
  assert.equal((await post(`/api/admin/mobile/releases/${mobileRelease.body.id}/approve`,
    { revision:1 },hostCookie)).status,409);
  const mobileEvents = await fetch(base + `/api/admin/mobile/releases/${mobileRelease.body.id}/events`,
    { headers:{ Cookie:hostCookie } });
  assert.deepEqual((await mobileEvents.json()).events.map((entry) => entry.action),["created","approve"]);
  const group = await post("/api/admin/groups", {
    name:"Support " + unique,
    features:{ meetings:true, remote_assist:true }
  }, hostCookie);
  assert.equal(group.status, 201);
  const put = async (path, body) => {
    const res = await fetch(base + path, { method:"PUT", headers:{
      Origin:origin, Cookie:hostCookie, "Content-Type":"application/json"
    }, body:JSON.stringify(body) });
    return { status:res.status, body:await res.json() };
  };
  const assigned = await put(`/api/admin/users/${guestLogin.body.id}/groups`,
    { groupIds:[group.body.id] });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body) + " " + log);
  const me = await fetch(base + "/api/me", { headers:{ Cookie:guestCookie } });
  assert.equal((await me.json()).features.remote_assist, true);
  hostWs.send(JSON.stringify({ type:"screen-state", active:true }));
  for (let i = 0; i < 20 && !guestMessages.some((m) => m.type === "screen-state"); i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(guestMessages.find((m) => m.type === "screen-state")?.active, true);
  guestWs.send(JSON.stringify({ type:"assist-request", to:hostLogin.body.id }));
  for (let i = 0; i < 20 && !hostMessages.some((m) => m.type === "assist-request"); i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(hostMessages.find((m) => m.type === "assist-request")?.from, guestLogin.body.id);
  hostWs.send(JSON.stringify({ type:"assist-response", to:guestLogin.body.id, approved:true }));
  for (let i = 0; i < 20 && !guestMessages.some((m) => m.type === "assist-response"); i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  guestWs.send(JSON.stringify({ type:"pointer", to:hostLogin.body.id, x:0.4, y:0.6 }));
  for (let i = 0; i < 20 && !hostMessages.some((m) => m.type === "pointer"); i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(hostMessages.find((m) => m.type === "pointer")?.x, 0.4);
  const guestClosed = once(guestWs, "close");
  assert.equal((await put(`/api/admin/groups/${group.body.id}`,
    { features:{ meetings:false, remote_assist:false, call_center:true } })).status, 200);
  await guestClosed;
  const noMeeting = await fetch(base + "/api/meetings/config", { headers:{ Cookie:guestCookie } });
  assert.equal(noMeeting.status, 403);
  assert.equal((await post(`/api/meetings/${id}/end`, {}, guestCookie)).status, 403);
  assert.equal((await post(`/api/meetings/${id}/lock`, { locked:true }, hostCookie)).status, 200);
  assert.equal((await post(`/api/meetings/${id}/end`, {}, hostCookie)).status, 200);
  const unavailable = await fetch(base + "/api/meetings/" + id, { headers:{ Cookie:guestCookie } });
  assert.equal(unavailable.status, 403);
  await db.query("UPDATE users SET role='super_admin' WHERE id=$1",[hostLogin.body.id]);
  const tenant = await post("/api/admin/tenants",{
    name:"Isolated " + unique,slug:"isolated-" + unique.replace(/[^a-z0-9]/gi,"").toLowerCase()
  },hostCookie);
  assert.equal(tenant.status,201,JSON.stringify(tenant.body) + " " + log);
  const otherEmail = "other" + unique + "@example.com";
  const tenantUser = await post("/api/admin/tenant-users",{
    tenantId:tenant.body.id,name:"Other admin",email:otherEmail,password,role:"admin"
  },hostCookie);
  assert.equal(tenantUser.status,201,JSON.stringify(tenantUser.body));
  const otherLogin = await post("/api/login",{email:otherEmail,password});
  const otherCookie = otherLogin.cookie.split(";")[0];
  assert.equal(otherLogin.body.tenantId,tenant.body.id);
  assert.equal((await post("/api/contacts",{email:"guest" + unique + "@example.com"},otherCookie)).status,404);
  assert.equal((await post("/api/admin/tenants",{name:"Denied",slug:"denied-tenant"},otherCookie)).status,403);
  assert.equal((await put(`/api/admin/groups/${group.body.id}`,{features:{messaging:true,call_center:true}})).status,200);
  const crossGroup = await fetch(base + "/api/admin/groups",{headers:{Cookie:otherCookie}});
  assert.equal((await crossGroup.json()).groups.some((g) => g.id === group.body.id),false);
  const crossMeeting = await fetch(base + "/api/meetings/" + id,{headers:{Cookie:otherCookie}});
  assert.equal(crossMeeting.status,404);
  const crossApps = await fetch(base + "/api/admin/mobile/apps",{headers:{Cookie:otherCookie}});
  assert.equal((await crossApps.json()).apps.some((a) => a.id === mobileApp.body.id),false);
  const ext = await post("/api/pbx/extensions",{
    number:"101",name:"Support",userId:guestLogin.body.id,voicemailEnabled:true
  },hostCookie);
  assert.equal(ext.status,201,JSON.stringify(ext.body) + " " + log);
  const queue = await post("/api/pbx/queues",{
    number:"600",name:"Support queue",strategy:"ordered",maxWaitSeconds:120
  },hostCookie);
  assert.equal(queue.status,201,JSON.stringify(queue.body));
  const queueMembers = await put(`/api/pbx/queues/${queue.body.id}/members`,{
    userIds:[guestLogin.body.id]
  });
  assert.equal(queueMembers.status,200,JSON.stringify(queueMembers.body));
  assert.equal((await post("/api/pbx/agent-status",{status:"ready"},guestCookie)).status,200);
  const queuePreview = await fetch(base + `/api/pbx/queues/${queue.body.id}/preview`,{
    headers:{Cookie:hostCookie}
  });
  assert.equal((await queuePreview.json()).eligible[0].user_id,guestLogin.body.id);
  assert.equal((await post("/api/pbx/inbound-routes",{
    did:"+12125550124",destinationId:queue.body.id
  },hostCookie)).status,200);
  const trunk = await post("/api/pbx/trunks",{
    name:"Test trunk",host:"sip.example.com",port:5061,transport:"tls",priority:100
  },hostCookie);
  assert.equal(trunk.status,201,JSON.stringify(trunk.body));
  assert.equal((await post("/api/pbx/rates",{
    prefix:"1",trunkId:trunk.body.id,costCentsPerMinute:2,priceCentsPerMinute:3
  },hostCookie)).status,201);
  const enableTrunk = await put(`/api/pbx/trunks/${trunk.body.id}/status`,{enabled:true,revision:trunk.body.revision});
  assert.equal(enableTrunk.status,200,JSON.stringify(enableTrunk.body));
  const ratePreview = await fetch(base + "/api/pbx/route-preview?number=%2B12125550124",{
    headers:{Cookie:hostCookie}
  });
  assert.equal((await ratePreview.json()).route.price_cents_per_minute,3);
  assert.equal((await post("/api/pbx/inbound-routes",{
    did:"+12125550125",destinationId:queue.body.id
  },otherCookie)).status,404);
  const crossPbx = await fetch(base + "/api/pbx/extensions",{headers:{Cookie:otherCookie}});
  assert.equal((await crossPbx.json()).extensions.length,0);
  const switched = await post(`/api/admin/tenants/${tenant.body.id}/switch`,{},hostCookie);
  assert.equal(switched.status,200);
  const scopedUsers = await fetch(base + "/api/admin/users",{headers:{Cookie:hostCookie}});
  const tenantUsers = (await scopedUsers.json()).users;
  assert.equal(tenantUsers.some((u) => u.id === tenantUser.body.id),true);
  assert.equal(tenantUsers.some((u) => u.id === guestLogin.body.id),false);
  assert.equal((await post(`/api/admin/tenants/${"00000000-0000-4000-8000-000000000000"}/switch`,{},hostCookie)).status,200);
  const suspend = await fetch(base + `/api/admin/tenants/${tenant.body.id}/status`,{
    method:"PUT",headers:{Origin:origin,Cookie:hostCookie,"Content-Type":"application/json"},
    body:JSON.stringify({status:"suspended"})
  });
  assert.equal(suspend.status,200);
  const suspended = await fetch(base + "/api/me",{headers:{Cookie:otherCookie}});
  assert.equal(suspended.status,401);

});
