import fs from 'node:fs/promises';
const ids=new Set(['kamailio','rtpengine','fs2','fs3','pbx','postfix','dovecot','rspamd']);
const capabilities=['sip','routing','provisioning','commissioning','termination','full_services'];
export function sanitizeInventory(input,now=Date.now()){
  if(input?.schemaVersion!==1||!Array.isArray(input.services)||input.services.length>8)throw Error('Invalid inventory');
  const at=Date.parse(input.checkedAt),fresh=Number.isFinite(at)&&at<=now+60000&&now-at<180000;
  return {checkedAt:Number.isFinite(at)?new Date(at).toISOString():null,fresh,services:input.services.filter(s=>ids.has(s.id)).map(s=>({id:s.id,name:String(s.name).slice(0,80),active:fresh&&s.active===true,transportConnected:fresh&&s.transportConnected===true,capabilities:Object.fromEntries(capabilities.map(key=>[key,'pending'])),reason:'Live SIP, routing, provisioning and call acceptance required'}))};
}
export async function serviceInventory(){
  try{return sanitizeInventory(JSON.parse(await fs.readFile('/var/lib/olamide/service-inventory/status.json','utf8')));}
  catch{return {fresh:false,checkedAt:null,services:[],reason:'Run the service-gui Ansible playbook to publish live inventory'};}
}
