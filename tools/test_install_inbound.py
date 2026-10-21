import tempfile
from pathlib import Path
script=Path(__file__).with_name('install-inbound-did-owner.py').read_text()
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);path=root/'services/api/flowrouteDidRouting.js';path.parent.mkdir(parents=True)
    original="""// Local carrier settings retained
export async function didOwner(pool,tenant,number){ return oldLookup(); }
export async function inboundDid(pool,data){
 if(!carrierSource(data.sourceIp))return [403,{}];
 const tenant=process.env.FLOWROUTE_WEBHOOK_TENANT_ID;
 const rows=await pool.query('SELECT username,domain FROM sip_accounts WHERE tenant_id=$1 AND user_id=$2 AND status=\'active\' ORDER BY created_at LIMIT 2',[tenant,'user']);
 const sip=rows.rows[0];return sip;
}
export async function flowrouteApi(){ return 'existing credentials'; }
export async function provisionDid(){ return 'existing provisioning'; }
"""
    path.write_text(original)
    patched=script.replace("Path('/opt/olamide/repo')",'Path('+repr(tmp)+')')
    exec(compile(patched,'installer','exec'));first=path.read_text()
    assert 'lookupInboundDidOwner(pool,tenant,number)' in first
    assert 'uniqueInboundSip(rows.rows)' in first
    assert original[original.index('export async function flowrouteApi('):] in first
    exec(compile(patched,'installer','exec'));assert path.read_text()==first
    path.write_text(original.replace('const sip=rows.rows[0];','const sip=customSelector(rows);'))
    before=path.read_text()
    try:exec(compile(patched,'installer','exec'))
    except RuntimeError:pass
    else:raise AssertionError('Unexpected source should fail closed')
    assert path.read_text()==before
print('Installer preserves provisioning, is idempotent, and fails without writing on unexpected code')
