"""Require an authenticated local dialog RPC result before a switch deployment."""
import pathlib,re,subprocess,sys

def parse_counts(text):
    if re.search(r'\berror\b|\bfault\b',text,re.I):
        raise ValueError('rpc_unavailable')
    counts={}
    for key in ('starting','connecting','answering','ongoing','all'):
        values=re.findall(r'^\s*'+key+r'\s*:\s*([0-9]+)\s*$',text,re.M)
        if len(values)!=1:
            raise ValueError('rpc_invalid_response')
        counts[key]=int(values[0])
    if counts['all']!=sum(counts[k] for k in ('starting','connecting','answering','ongoing')):
        raise ValueError('rpc_invalid_response')
    return counts['all']

def main():
    try:
        result=subprocess.run(['kamcmd','-s','unix:/run/kamailio/olamide_carrier_ctl','dlg.stats_active'],capture_output=True,text=True,timeout=15)
        pathlib.Path(sys.argv[1]).write_text(result.stdout+result.stderr)
        if result.returncode:
            raise ValueError('rpc_unavailable')
        active=parse_counts(result.stdout)
        if active:
            print('INHOUSE_GATE error=active_calls count='+str(active))
            return 1
        print('INHOUSE_GATE idle=true')
        return 0
    except (OSError,subprocess.TimeoutExpired):
        print('INHOUSE_GATE error=rpc_unavailable')
        return 1
    except ValueError as error:
        print('INHOUSE_GATE error='+str(error))
        return 1

if __name__=='__main__':
    sys.exit(main())
