#!/usr/bin/env python3
"""Fail closed on incomplete or conflicting reviewed FreeSWITCH bundles."""
import pathlib, sys, xml.etree.ElementTree as ET

def validate(directory, sip, esl, low, high):
    root = pathlib.Path(directory)
    assert root.is_absolute() and (root / 'freeswitch.xml').is_file(), 'Complete private bundle required'
    values = {}
    for path in root.rglob('*.xml'):
        tree = ET.parse(path)
        for node in tree.iter('X-PRE-PROCESS'):
            if node.get('cmd') == 'set' and '=' in node.get('data', ''):
                key, value = node.get('data').split('=', 1)
                values[key] = value
    def resolve(value):
        for _ in range(10):
            if value and value.startswith('$${') and value.endswith('}'):
                value = values.get(value[3:-1])
            else:
                return value
        raise ValueError('Recursive variable')
    def params(path):
        return {n.get('name'): resolve(n.get('value')) for n in ET.parse(path).iter('param')}
    event = params(root / 'autoload_configs/event_socket.conf.xml')
    assert event.get('listen-ip') == '127.0.0.1'
    assert event.get('listen-port') == str(esl)
    assert len(event.get('password') or '') >= 32 and event.get('password') != 'ClueCon'
    core = params(root / 'autoload_configs/switch.conf.xml')
    assert core.get('rtp-start-port') == str(low) and core.get('rtp-end-port') == str(high)
    profiles = list((root / 'sip_profiles').glob('*.xml'))
    assert len(profiles) == 1, 'Exactly one private Kamailio-facing profile required'
    profile = params(profiles[0])
    assert profile.get('sip-ip') == '127.0.0.1' and profile.get('sip-port') == str(sip)
    assert not any(profile.get(key) for key in ('ws-binding', 'wss-binding', 'tls-sip-port'))
    assert profile.get('auth-calls') == 'true', 'Authenticated backend required'
    return True

if __name__ == '__main__':
    validate(sys.argv[1], *map(int, sys.argv[2:]))
