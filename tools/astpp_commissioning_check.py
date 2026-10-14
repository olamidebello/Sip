#!/usr/bin/env python3
"""Read-only commissioning inventory. Never changes routes or reports call acceptance."""
import argparse,json,pathlib,subprocess,urllib.request

def command(argv):
    try:
        result=subprocess.run(argv,capture_output=True,text=True,timeout=15,check=False)
        return result.returncode,result.stdout
    except (OSError,subprocess.TimeoutExpired):return 1,''

def check(native_directory='/etc/olamide/native-astpp',adapter_path='/etc/olamide/carrier-adapter.json',run=command,fetch=None):
    root=pathlib.Path(native_directory)
    report={'stage':'gui_install_needed','checks':{},'nativeCallAcceptance':'unverified','nativeBillingAcceptance':'unverified'}
    checks=report['checks']
    try:
        c=json.loads((root/'config.json').read_text())
        keys=all(isinstance(c.get(k),str) and bool(c[k]) for k in ('dbPassword','privateKey','sessionKey','operatorPassword'))
        keys=keys and c.get('baseUrl')=='http://localhost:8089/' and (root/'runtime.env').is_file()
    except (OSError,ValueError):keys=False
    checks['nativePrivateConfiguration']='present' if keys else 'missing_or_invalid'
    try:
        if fetch is None:
            with urllib.request.urlopen('http://127.0.0.1:8089/',timeout=10) as response:page=response.read(262144).decode(errors='replace')
        else:page=fetch()
        web='login_form' in page and 'password' in page
    except Exception:web=False
    checks['nativeLoginPage']='reachable' if web else 'unavailable'
    db=False
    if keys:
        compose=['docker','compose','-p','olamide-native-astpp','--env-file',str(root/'runtime.env'),'-f','/opt/olamide/repo/deployment/native-astpp/compose.yml']
        # The password expands only inside the private container, never into host argv or output.
        sql='SELECT (SELECT COUNT(*) FROM olamide_native_bootstrap WHERE id=1),(SELECT COUNT(*) FROM accounts WHERE id=1 AND status=0 AND deleted=0),(SELECT COUNT(*) FROM trunks),(SELECT COUNT(*) FROM gateways),(SELECT COUNT(*) FROM outbound_routes);'
        rc,out=run(compose+['exec','-T','native-db','sh','-c','MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -uastppuser --batch --skip-column-names astpp -e "$1"','native-check',sql])
        values=out.strip().split('\t')
        if rc==0 and len(values)==5 and all(v.isdigit() for v in values):
            marker,admin,trunks,gateways,rates=map(int,values);db=marker==1 and admin==1
            checks['nativeRecordCounts']={'trunks':trunks,'gateways':gateways,'terminationRates':rates}
    checks['nativeDatabase']='initialized' if db else 'unavailable_or_incomplete'
    try:
        adapter=json.loads(pathlib.Path(adapter_path).read_text())
        backend=adapter.get('backend','freeswitch')
        backend=backend if backend in ('kamailio','freeswitch') else 'unknown'
        checks['carrierAdapterBackend']=backend
        checks['carrierAdapterRoutingConfigured']=adapter.get('routingCommissioned') is True
        if backend=='freeswitch':
            cli=adapter.get('fs_cli')
            if isinstance(cli,str) and pathlib.Path(cli).is_absolute():
                rc,out=run([cli,'-x','status']);checks['adapterFreeSWITCHProcess']='responding' if rc==0 and 'UP' in out else 'unavailable'
            else:checks['adapterFreeSWITCHProcess']='cli_not_configured'
        else:checks['adapterFreeSWITCHProcess']='not_used_by_adapter'
    except (OSError,ValueError):checks['carrierAdapterBackend']='not_configured'
    if keys and web and db:report['stage']='gui_runtime_ready'
    report['nextSteps']=['Confirm the native FreeSWITCH XML/Lua/database integration and its dedicated SIP/RTP/ESL topology.','Verify native charging and credit cutoff on controlled test calls.','Verify two-way audio and DTMF before enabling native termination traffic.']
    report['scope']='Read-only inventory; Olamide adapter configuration does not prove native ASTPP routing or billing. No calls were placed.'
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--native-directory',default='/etc/olamide/native-astpp');parser.add_argument('--adapter-config',default='/etc/olamide/carrier-adapter.json');args=parser.parse_args()
    report=check(args.native_directory,args.adapter_config);print(json.dumps(report,indent=2));raise SystemExit(0 if report['stage']=='gui_runtime_ready' else 2)
