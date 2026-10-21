import importlib.util,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).parent

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
sync=load('sync','voicemail-sync.py');kam=load('kam','patch-voicemail-kamailio.py');installer=load('installer','install-voicemail-local.py')
BOX='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';TENANT='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

def fixture():return '''#!KAMAILIO
# credential headers must be retained byte-for-byte
request_route {
    if ($tt != $null) { t_on_reply("MEDIA_REPLY"); }
    if ($fU != $au || $rd != $var(realm)) { sl_send_reply("403","Tenant mismatch"); exit; }
    if (!($rU =~ "^([a-zA-Z0-9]{2,64}|[+][1-9][0-9]{7,14})$")) { exit; }
    http_client_query("http://127.0.0.1:18080/api/switch/kamailio/route","$var(req)","Authorization: Bearer TOKEN","$var(body)");
    $ru="sip:" + $var(target) + "@" + $var(realm);
    record_route();
    t_on_reply("MEDIA_REPLY");
    if (!lookup("location")) { route(OLAMIDE_PUSH_WAIT); exit; }
    t_relay();
}
route[OLAMIDE_FLOWROUTE_INBOUND] {
    $ru = "sip:" + $var(inbound_user) + "@" + $var(inbound_domain);
    if (!lookup("location")) { sl_send_reply("480", "Subscriber offline"); exit; }
    record_route(); t_on_reply("FLOWROUTE_INBOUND_REPLY"); t_on_failure("FLOWROUTE_INBOUND_FAILED"); t_relay();
}
route[OLAMIDE_DID_INBOUND] {
    $ru="sip:" + $var(did_user) + "@" + $var(did_domain);
    if (!lookup("location")) { sl_send_reply("480","Recipient offline"); exit; }
    record_route(); t_on_reply("MEDIA_REPLY"); t_relay();
}
failure_route[FLOWROUTE_INBOUND_FAILED] { rtpengine_delete(); }
failure_route[OLAMIDE_PUSH_FAILED] { rtpengine_delete(); }
route[OLAMIDE_PUSH_RESUME] {
    if (t_is_canceled()) { rtpengine_delete(); exit; }
    if (!lookup("location")) { t_reply("480","Receiving device unavailable"); rtpengine_delete(); exit; }
    t_on_reply("MEDIA_REPLY"); t_relay();
}
route[OLAMIDE_PUSH_WAIT] {
    if (!t_newtran()) exit;
    if (!t_suspend()) exit;
    http_client_query("http://127.0.0.1:18080/wake","{}","Authorization: Bearer OTHER","$var(body)");
    if ($var(wake_http_status) != 202 || $var(wake_queued) == 0) {
        sht_lock("olamide_wait_index=>$var(wake_key)");
        if ($sht(olamide_wait_index=>$var(wake_key)) == $T(id_index)) {
            $sht(olamide_wait_index=>$var(wake_key))=$null;
            t_reply("480","No receiving device available");
            rtpengine_delete();
        }
        sht_unlock("olamide_wait_index=>$var(wake_key)");
    }
    exit;
}
route[OLAMIDE_PAID_CALL] { # paid billing must be untouched
    $var(paid)="test{value}"; route(OLAMIDE_FLOWROUTE); t_on_reply("PSTN_MEDIA_REPLY"); t_relay();
}
'''.replace('TOKEN','a'*64).replace('OTHER','b'*64)

class ToolsTest(unittest.TestCase):
    def test_compiler_isolates_tenants_and_sanitizes_untrusted_names(self):
        row=dict(mailbox_id=BOX,tenant_id=TENANT,enabled=1,max_seconds=60,revision=1,display_name='X\n[evil]\n => System(/bin/x), |')
        vm,ext=sync.compile_config([row],{})
        self.assertIn('maxsecs=60',vm);self.assertNotIn('[evil]',vm);self.assertNotIn('System(',vm)
        self.assertIn('VoiceMail('+BOX+'@tenant-'+TENANT+',u)',ext)
        self.assertIn('VoiceMailMain('+BOX+'@tenant-'+TENANT+',s)',ext)
        self.assertNotIn('System(',ext)
    def test_compiler_rejects_invalid_or_duplicate_rows(self):
        row=dict(mailbox_id=BOX,tenant_id=TENANT,enabled=1,max_seconds=120,revision=1)
        for rows in [[row,row],[{**row,'mailbox_id':'../bad'}],[{**row,'max_seconds':100000}],[{**row,'tenant_id':'x\n[evil]'}]]:
            with self.assertRaises(ValueError):sync.compile_config(rows,{})
    def test_disabled_mailbox_has_no_retrieval_or_recording_dialplan(self):
        vm,ext=sync.compile_config([dict(mailbox_id=BOX,tenant_id=TENANT,enabled=0,max_seconds=120,revision=1)],{})
        self.assertNotIn(BOX,ext);self.assertNotIn(BOX,vm)
    def test_kamailio_patch_is_idempotent_and_preserves_paid_routes(self):
        before=fixture();after=kam.patch(before)
        a,b=kam.block(before,'route','OLAMIDE_PAID_CALL');c,d=kam.block(after,'route','OLAMIDE_PAID_CALL');self.assertEqual(before[a:b],after[c:d])
        self.assertEqual(kam.patch(after),after);self.assertIn('Bearer '+'b'*64,after);self.assertEqual(after.count('Bearer '+'a'*64),2)
        self.assertLess(after.index('Tenant mismatch'),after.index('$rU == "*98"'))
        self.assertIn('t_is_canceled()',after);self.assertIn('408|480|486',after);self.assertNotIn('408|480|486|487',after)
        self.assertIn('route(OLAMIDE_VOICEMAIL); sl_send_reply("480", "Subscriber offline")',after)
    def test_kamailio_patch_refuses_unknown_layout(self):
        with self.assertRaises(ValueError):kam.patch(fixture().replace('    record_route();','    record_route_preset();',1))
    def test_source_installer_atomic_anchor_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for path in ['services/api/server.js','services/api/kamailioHttpBridge.js','services/api/pstnBilling.js','services/api/callAccess.js','apps/web/src/main.js']:
                p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('local changes\n')
            with self.assertRaises(RuntimeError):installer.integrate(root)
            self.assertEqual((root/'services/api/server.js').read_text(),'local changes\n')
if __name__=='__main__':unittest.main()
