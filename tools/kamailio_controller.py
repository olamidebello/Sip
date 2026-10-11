#!/usr/bin/env python3
"""Private allowlisted controller. Run once from a timer; never accepts shell code."""
import argparse, json, os, pathlib, re, subprocess, tempfile, urllib.request
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
    return profile,config

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
        inv=path/'inventory.json';inv.write_text(json.dumps(inventory));inv.chmod(0o600)
        cmd=['ansible-playbook','-i',str(inv),str(ROOT/'deploy/ansible/site.yml')]
        if vault: cmd += ['--vault-password-file',vault]
        result=subprocess.run(cmd,cwd=ROOT/'deploy/ansible',capture_output=True,text=True,timeout=3600)
        if result.returncode: raise RuntimeError('Ansible commissioning failed; inspect the private controller logs')
        report=json.loads((path/'target.json').read_text())
        expected=set(profile['enabledModules'])
        configured={f['id'] for f in report['features'] if f['status']!='pending'}
        if not expected <= configured: raise RuntimeError('Runtime audit did not confirm expected capabilities')
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
            result={'id':plan['id'],'status':'succeeded','summary':'Commissioned profile; see per-module acceptance status','report':report}
        except (KeyError,ValueError,RuntimeError,OSError,subprocess.TimeoutExpired) as e:
            result={'id':plan['id'],'status':'failed','summary':str(e)[:500]}
        call(args.base,token,'result',result)

if __name__=='__main__': main()
