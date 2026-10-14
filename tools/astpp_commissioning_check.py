#!/usr/bin/env python3
"""Read-only commissioning inventory. Never changes routes or reports call acceptance."""
import argparse,json,pathlib,subprocess,urllib.request

def command(argv):
    try:
        result=subprocess.run(argv,capture_output=True,text=True,timeout=15,check=False)
        return result.returncode,result.stdout
    except (OSError,subprocess.TimeoutExpired):return 1,''

def check(native_directory='/etc/olamide/native-astpp',adapter_path='/etc/olamide/carrier-adapter.json',run=command,fetch=None,production_backend='native_astpp'):
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
        backend=adapter.get('backend','unknown')
        backend=backend if backend == 'kamailio' else 'unknown'
        checks['carrierAdapterBackend']=backend
        checks['carrierAdapterRoutingConfigured']=adapter.get('routingCommissioned') is True
    except (OSError,ValueError):checks['carrierAdapterBackend']='not_configured'
    if keys and web and db:report['stage']='gui_runtime_ready'
    if checks['carrierAdapterBackend']=='kamailio':
        cli=adapter.get('kamcmd','/usr/sbin/kamcmd');socket=adapter.get('rpcSocket')
        healthy=False
        if isinstance(cli,str) and pathlib.Path(cli).is_absolute() and isinstance(socket,str) and (socket.startswith('/') or socket.startswith('unix:/')):
            core_rc,core=run([cli,'-s',socket,'core.uptime'])
            table_rc,tables=run([cli,'-s',socket,'htable.listTables'])
            healthy=core_rc==0 and bool(core.strip()) and not core.lstrip().startswith('error:')
            table=table_rc==0 and 'olamide_carrier' in tables and not tables.lstrip().startswith('error:')
            checks['kamailioRPC']='responding' if healthy else 'unavailable'
            checks['kamailioFlowrouteTable']='present' if table else 'missing'
            healthy=healthy and table
        else:checks['kamailioRPC']='private_socket_not_configured'
        if production_backend=='kamailio':
            report['stage']='kamailio_adapter_ready' if healthy and checks['carrierAdapterRoutingConfigured'] else 'kamailio_adapter_check_needed'
        report['nextSteps']=['Verify authenticated Kamailio Flowroute routes and adapter acknowledgments.','Verify credit reservation, CDR settlement and credit cutoff on controlled test calls.','Verify two-way media and DTMF through the existing media relay.']
    elif production_backend=='kamailio':report['stage']='kamailio_adapter_check_needed'
    if 'nextSteps' not in report:report['nextSteps']=['The optional native GUI is independent of production Kamailio routing.','Verify native charging and credit cutoff on controlled test calls.','Verify two-way audio and DTMF before enabling native termination traffic.']
    report['scope']='Read-only inventory; Olamide adapter configuration does not prove native ASTPP routing or billing. No calls were placed.'
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--native-directory',default='/etc/olamide/native-astpp');parser.add_argument('--adapter-config',default='/etc/olamide/carrier-adapter.json');parser.add_argument('--production-backend',choices=['native_astpp','kamailio'],default='kamailio');args=parser.parse_args()
    report=check(args.native_directory,args.adapter_config,production_backend=args.production_backend);print(json.dumps(report,indent=2));raise SystemExit(0 if report['stage'] in ('gui_runtime_ready','kamailio_adapter_ready') else 2)
