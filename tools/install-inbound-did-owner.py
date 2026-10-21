from pathlib import Path
root=Path('/opt/olamide/repo')
p=root/'services/api/flowrouteDidRouting.js'
s=p.read_text()
start=s.index('export async function didOwner(')
end=s.index('export async function inboundDid(',start)
replacement="""export async function didOwner(pool,tenant,number){
 return lookupInboundDidOwner(pool,tenant,number);
}
"""
updated=s[:start]+replacement+s[end:]
if "from './inboundDidOwner.js'" not in updated:
    updated="import {lookupInboundDidOwner,uniqueInboundSip} from './inboundDidOwner.js';\n"+updated
old='const sip=rows.rows[0];'
new='const sip=uniqueInboundSip(rows.rows);'
if new not in updated:
    if updated.count(old)!=1:raise RuntimeError('Unexpected inbound SIP selection; no files written')
    updated=updated.replace(old,new)
if not all(marker in updated for marker in ['carrierSource(data.sourceIp)','FLOWROUTE_WEBHOOK_TENANT_ID','export async function flowrouteApi(','export async function provisionDid(']):
    raise RuntimeError('Expected carrier safeguards and provisioning functions missing; no files written')
p.write_text(updated)
