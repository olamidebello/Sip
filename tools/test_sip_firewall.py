import importlib.util,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).parent/file);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
fw=load('firewall','olamide-firewall.py');edge=load('edge','harden-sip-edge.py')
POLICY={'ssh':[22,2222],'sip_tcp':[],'sip_udp':[5060],'rtp':[(30000,40000)],'turn_tcp':[],'turn_udp':[]}
class FirewallTests(unittest.TestCase):
    def test_detect_public_sip_without_exposing_private_websocket_or_vm(self):
        tcp,udp=fw.sip_ports('listen=udp:154.29.77.102:5060\nlisten=tcp:172.18.0.1:8088\nlisten=udp:127.0.0.1:5062\n')
        self.assertEqual((tcp,udp),([],[5060]))
    def test_unknown_listeners_fail_before_activation(self):
        for text in ['listen=udp:MY_IP:5060','listen=sctp:154.29.77.102:5060','listen=udp:127.0.0.1:5062','listen=tcp:172.18.0.1:9000\nlisten=udp:154.29.77.102:5060']:
            with self.assertRaises(ValueError):fw.sip_ports(text)
    def test_media_range_uses_runtime_override_and_each_interface(self):
        cfg='[rtpengine]\nport-min=20000\nport-max=21000\ninterfaces-config=interface\n[interface-public]\naddress=154.29.77.102\nport-min=45000\nport-max=46000\n'
        self.assertEqual(fw.rtp_ranges(['rtpengine','--port-min=30000','--port-max','40000'],cfg),[(30000,40000),(45000,46000)])
        self.assertEqual(fw.rtp_ranges(['rtpengine','-m30000','-M40000'],''),[(30000,40000)])
    def test_invalid_media_ranges_rejected(self):
        for args in [['--port-min=0'],['--port-min=40000','--port-max=30000'],['--port-min=100','--port-max=65000']]:
            with self.assertRaises(ValueError):fw.rtp_ranges(args,'')
    def test_active_turn_preserves_its_real_relay_range(self):
        tcp,udp=fw.turn_ports([], 'listening-port=3478\nmin-port=49160\nmax-port=49260\nno-tls\nno-dtls\nstatic-auth-secret=DO_NOT_RENDER\n')
        self.assertEqual(sorted(tcp),[(3478,3478),(49160,49260)]);self.assertEqual(sorted(udp),sorted(tcp))
        with self.assertRaises(ValueError):fw.turn_ports([], 'static-auth-secret=private')
    def test_policy_defaults_drop_and_keeps_docker_owned_tables(self):
        s=fw.render(POLICY);self.assertIn('policy drop',s);self.assertNotIn('flush ruleset',s);self.assertNotIn('table ip filter',s);self.assertIn('udp dport @media accept',s)
        self.assertIn('ct original proto-dst { 80,443 }',s);self.assertNotIn('3306',s);self.assertNotIn('18080',s);self.assertNotIn('5062',s);self.assertIn('tcp dport 8088 accept',s)
    def test_sip_limits_before_established_accept(self):
        s=fw.render(POLICY);self.assertLess(s.index('udp dport @sip_udp meta nfproto ipv4'),s.index('ct state established,related accept'));self.assertIn('ip saddr @carriers4 udp dport @sip_udp accept',s)
    def test_ssh_and_ipv6_networking_survive(self):
        s=fw.render(POLICY);self.assertIn('elements = { 22, 2222 }',s);self.assertIn('nd-neighbor-solicit',s);self.assertIn('packet-too-big',s);self.assertIn('iifname "lo" accept',s)
    def test_atomic_updates_target_only_owned_table(self):
        calls=[]
        with patch.object(fw,'table_exists',return_value=True),patch.object(fw,'run',side_effect=lambda args,*extra,**kw:calls.append((args,kw))):fw.load_rules(fw.render(POLICY),True)
        self.assertEqual(calls[0][0],['nft','-c','-f','-']);self.assertTrue(calls[0][1]['body'].startswith('delete table inet olamide_guard\n'));self.assertNotIn('flush ruleset',calls[0][1]['body'])
    def test_confirmation_requires_second_connection(self):
        with patch.object(fw,'pending',return_value={'session':'1.2.3.4 12345 154.29.77.102 22'}),patch.dict(os.environ,{'SSH_CONNECTION':'1.2.3.4 12345 154.29.77.102 22'}),patch.object(fw,'health') as health:
            with self.assertRaisesRegex(RuntimeError,'NEW SSH'):fw.confirm()
            health.assert_not_called()
    def test_expired_rollback_token_cannot_revert_new_change(self):
        with patch.object(fw,'pending',return_value={'token':'new'}),patch.object(fw,'load_rules') as load:fw.rollback('old');load.assert_not_called()
    def test_headers_preserve_websocket_uploads_and_payment_handlers(self):
        s='{$DOMAIN} {\n handle /ws { reverse_proxy local:8088 }\n handle /api/* { reverse_proxy api:8080 }\n}\n'
        result=edge.patch(s);self.assertIn('handle /ws { reverse_proxy local:8088 }',result);self.assertIn('handle /api/* { reverse_proxy api:8080 }',result);self.assertIn('/api/switch/kamailio/*',result);self.assertNotIn('script-src',result);self.assertEqual(edge.patch(result),result)
        with self.assertRaises(ValueError):edge.patch('another.example {\n}\n')
class RangeTests(unittest.TestCase):
    def test_overlapping_media_interfaces_compile_to_nonconflicting_intervals(self):
        self.assertEqual(fw.elements([(30000,40000),(35000,45000),(45001,45002)]),'30000-45002')

class RollbackTests(unittest.TestCase):
    def test_rollback_restores_prior_owned_policy_and_persistent_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);state=root/'state';state.mkdir();backup=root/'backup';backup.mkdir()
            previous='table inet olamide_guard { chain input { type filter hook input priority -10; policy accept; } }'
            (backup/'previous.nft').write_text(previous);target=root/'approved.nft';target.write_text('candidate')
            data={'token':'token','backup':str(backup),'persistent':{str(target):'previous-approved'},'sysctls':{'net.ipv4.tcp_syncookies':'0'},'service_enabled':False,'fail2ban_active':False}
            (state/'pending.json').write_text(__import__('json').dumps(data));calls=[]
            with patch.object(fw,'STATE',state),patch.object(fw,'load_rules') as load,patch.object(fw,'run',side_effect=lambda args,*extra,**kw:calls.append(args)):
                fw.rollback('token');load.assert_called_once_with(previous)
            self.assertEqual(target.read_text(),'previous-approved');self.assertFalse((state/'pending.json').exists());self.assertIn(['systemctl','disable','olamide-firewall.service'],calls)
    def test_first_install_rollback_removes_only_owned_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'previous.nft').write_text('');(root/'pending.json').write_text(__import__('json').dumps({'token':'token','backup':str(root)}));calls=[]
            with patch.object(fw,'STATE',root),patch.object(fw,'table_exists',return_value=True),patch.object(fw,'run',side_effect=lambda args,*extra,**kw:calls.append(args)):fw.rollback('token')
            self.assertIn(['nft','delete','table','inet','olamide_guard'],calls);self.assertFalse(any('flush' in c for c in calls))
if __name__=='__main__':unittest.main()
