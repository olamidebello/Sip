#!/usr/bin/env python3
"""Private allowlisted controller. Run once from a timer; never accepts shell code."""
import argparse, datetime, json, os, pathlib, re, subprocess, tempfile, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1]

def call(base, token, endpoint, body=None):
    req = urllib.request.Request(base+'/api/integrations/kamailio/'+endpoint,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)

def validate_profile(plan, profiles):
    if not re.fullmatch(r'[a-z][a-z0-9_-]{0,63}', plan['profile']): raise ValueError('Invalid profile')
    profile = profiles[plan['profile']]
    if plan['host'] not in profile['allowedHosts']: raise ValueError('Node host is outside the private profile allowlist')
    if not re.fullmatch(r'[a-z_][a-z0-9_-]{0,31}',plan['ssh_user']): raise ValueError('Invalid SSH user')
    if not isinstance(plan['ssh_port'],int) or not 1<=plan['ssh_port']<=65535: raise ValueError('Invalid SSH port')
    for item in plan['modules']:
        if item['install'] and item['id'] not in profile['installedModules']:
            raise ValueError('Package recipe unavailable for '+item['id'])
        if item['enable'] != (item['id'] in profile['enabledModules']):
            raise ValueError('Reviewed configuration does not match requested state for '+item['id'])
    if any(not re.fullmatch(r'kamailio(-[a-z0-9-]+)?',p) for p in profile['packages']):
        raise ValueError('Invalid package recipe')
    config = pathlib.Path(profile['configDirectory']).resolve()
    if not config.is_dir() or not (config/'kamailio.cfg').is_file(): raise ValueError('Complete configuration bundle required')
    if profile.get('sameServer'):
        settings=profile.get('sameServerSettings',{})
        required={'sip_domain','sip_public_ip','sip_public_interface','sip_bridge_ip','sip_bridge_interface','sip_docker_subnet','sip_rtp_min','sip_rtp_max','rtpengine_config_source','rtpengine_service','rtpengine_package','sip_carrier_cidrs'}
        if not required <= set(settings) or set(settings)-required-{'mail_enabled','mail_hostname','mail_config_source','mail_certificate','mail_key','mail_domain','pbx_enabled','pbx_source_archive','pbx_source_sha256','pbx_config_source','pbx_version','freeswitch_cluster_enabled','freeswitch_instances','freeswitch_image','freeswitch_maintenance_approved'}: raise ValueError('Complete private same-server settings required')
        addresses=json.loads(subprocess.check_output(['ip','-j','-4','address'],text=True))
        local={a['local'] for interface in addresses for a in interface.get('addr_info',[])}
        if plan['host'] not in local or settings['sip_public_ip']!=plan['host']:
            raise ValueError('Same-server controller must run on the selected application host')
        if os.geteuid()!=0 or plan['ssh_user']!='root':
            raise ValueError('Local same-server controller requires root identity')
        if settings.get('mail_enabled') and not {'mail_hostname','mail_config_source','mail_certificate','mail_key','mail_domain'} <= set(settings):
            raise ValueError('Complete private mail settings required')
        if settings.get('pbx_enabled'):
            if not {'pbx_source_archive','pbx_source_sha256','pbx_config_source','pbx_version'} <= set(settings):
                raise ValueError('Complete pinned PBX build settings required')
            if not re.fullmatch(r'[a-f0-9]{64}',settings['pbx_source_sha256']) or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',settings['pbx_version']):
                raise ValueError('Verified PBX checksum and pinned version required')
            if not pathlib.Path(settings['pbx_source_archive']).is_file() or not pathlib.Path(settings['pbx_config_source']).is_dir():
                raise ValueError('Private PBX artifact and configuration required')
        if not pathlib.Path(settings['rtpengine_config_source']).is_file():
            raise ValueError('Reviewed media relay configuration required')
    return profile,config

def verify_acceptance(report, receipt, required_calls):
    expected={'registration','invalid_credentials_rejected','unauthenticated_relay_rejected','two_way_audio','dtmf','carrier_inbound','carrier_outbound','billing_reservation','billing_settlement','fraud_limits','credential_revocation','backup_restore','monitoring_alert','failover','smtp_delivery','imap_login','spf_dkim_dmarc','ptr'}
    at=datetime.datetime.fromisoformat(receipt['checkedAt'].replace('Z','+00:00'))
    age=(datetime.datetime.now(datetime.timezone.utc)-at).total_seconds()
    if not 0<=age<=86400 or receipt.get('host')!=report['host'] or receipt.get('nodeId')!=report['nodeId'] or receipt.get('configHash')!=report['configHash']:
        raise ValueError('Fresh acceptance evidence bound to this host, node and configuration is required')
    if any(receipt.get('tests',{}).get(key) is not True for key in expected):
        raise ValueError('Production acceptance tests remain pending')
    if type(receipt.get('concurrentCalls')) is not int or receipt['concurrentCalls']<required_calls:
        raise ValueError('Target concurrent-call load acceptance remains pending')
    return True

def apply(plan, profile, config, vault=None):
    with tempfile.TemporaryDirectory(prefix='olamide-kamailio-') as tmp:
        path=pathlib.Path(tmp)
        inventory={'all':{'children':{'switch_nodes':{'hosts':{'target':{
            'ansible_host':plan['host'],'ansible_user':plan['ssh_user'],'ansible_port':plan['ssh_port'],
            'kamailio_node_id':plan['node_id']}},'vars':{
                'kamailio_packages':profile['packages'],'kamailio_config_source':str(config),
                'kamailio_expected_modules':profile['enabledModules'],
                'kamailio_maintenance_approved':profile.get('maintenanceApproved',False),
                'kamailio_repo_path':profile.get('repoPath','/opt/olamide'),'kamailio_audit_output':tmp}}}}}
        if profile.get('sameServer'):
            group=inventory['all']['children']['switch_nodes']
            group['hosts']['target']['ansible_connection']='local'
            group['vars'].update(profile['sameServerSettings'])
        inv=path/'inventory.json';inv.write_text(json.dumps(inventory));inv.chmod(0o600)
        cmd=['ansible-playbook','-i',str(inv),str(ROOT/('deploy/ansible/same-server.yml' if profile.get('sameServer') else 'deploy/ansible/site.yml'))]
        if vault: cmd += ['--vault-password-file',vault]
        result=subprocess.run(cmd,cwd=ROOT/'deploy/ansible',capture_output=True,text=True,timeout=3600)
        if result.returncode: raise RuntimeError('Ansible commissioning failed; inspect the private controller logs')
        report=json.loads((path/'target.json').read_text())
        expected=set(profile['enabledModules'])
        configured={f['id'] for f in report['features'] if f['status']!='pending'}
        if not expected <= configured: raise RuntimeError('Runtime audit did not confirm expected capabilities')
        if profile.get('requireProductionAcceptance'):
            receipt=json.loads(pathlib.Path(profile['acceptanceFile']).read_text())
            verify_acceptance(report,receipt,profile.get('requiredConcurrentCalls',500))
        return report

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--profiles',required=True);p.add_argument('--vault-password-file');p.add_argument('--base',required=True)
    args=p.parse_args()
    if not args.base.startswith('https://'): raise SystemExit('HTTPS application URL required')
    token=os.environ.get('KAMAILIO_RUNNER_TOKEN','')
    if len(token)<32: raise SystemExit('KAMAILIO_RUNNER_TOKEN needs at least 32 characters')
    profiles=json.loads(pathlib.Path(args.profiles).read_text())
    for plan in call(args.base,token,'plans')['plans']:
        if not call(args.base,token,'claim',{'id':plan['id']})['claimed']: continue
        try:
            profile,config=validate_profile(plan,profiles)
            report=apply(plan,profile,config,args.vault_password_file)
            result={'id':plan['id'],'status':'succeeded','summary':('Commissioned profile; private acceptance evidence validated' if profile.get('requireProductionAcceptance') else 'Services commissioned; production acceptance remains pending'),'report':report}
        except (KeyError,TypeError,ValueError,RuntimeError,OSError,subprocess.TimeoutExpired) as e:
            result={'id':plan['id'],'status':'failed','summary':str(e)[:500]}
        call(args.base,token,'result',result)

if __name__=='__main__': main()
