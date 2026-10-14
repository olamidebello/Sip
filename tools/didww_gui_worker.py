#!/usr/bin/env python3
"""Run fixed DIDWW provisioning jobs outside the unprivileged web container."""
import fcntl,json,os,pathlib,subprocess,time
REPO=pathlib.Path('/opt/olamide/repo')
CONFIG=pathlib.Path('/etc/olamide/didww-ip-only.json')
LOGDIR=pathlib.Path('/var/log/olamide')
COMPOSE=['docker','compose','--env-file','/etc/olamide/secrets.env','-f',str(REPO/'deployment/docker/compose.yml')]
def bridge(action,data=None):
    result=subprocess.run(COMPOSE+['exec','-T','api','node','didwwProvisionWorker.js',action],input=json.dumps(data) if data else None,capture_output=True,text=True,timeout=30,check=True)
    return json.loads(result.stdout)
def heartbeat():
    folder=pathlib.Path('/var/lib/olamide/service-inventory');folder.mkdir(exist_ok=True,parents=True)
    temp=folder/'.didww-worker.tmp';temp.write_text(json.dumps({'epoch':int(time.time())}));temp.chmod(0o644);temp.replace(folder/'didww-worker.json')
def execute(job):
    if not job.get('apiKey'):return False
    config=CONFIG
    # Fixed paths and fixed commands only; request data never becomes shell code.
    temp=config.with_suffix('.tmp');temp.write_text(json.dumps(dict(job['config'],apiKey=job['apiKey'])));temp.chmod(0o600);temp.replace(config)
    env=dict(os.environ)  # Do not inject tenant credentials into Docker Compose's environment.
    argv=['python3',str(REPO/'tools/prepare_didww_ip_only.py')] if job['mode']=='verify' else ['bash',str(REPO/'deployment/deploy-didww-ip-only.sh')]
    logdir=LOGDIR;logdir.mkdir(mode=0o700,exist_ok=True)
    logfile=logdir/'didww-provisioning.log'
    fd=os.open(logfile,os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
    with os.fdopen(fd,'a') as log:
        log.write('\nStarting DIDWW '+job['mode']+' job '+job['id']+'\n');log.flush()
        # The command never prints the API key. API and Ansible secret tasks suppress output.
        process=subprocess.Popen(argv,env=env,stdout=log,stderr=log,start_new_session=True)
        deadline=time.monotonic()+3000
        while process.poll() is None:
            heartbeat()
            if time.monotonic()>deadline:
                import signal
                os.killpg(process.pid,signal.SIGTERM)
                try:process.wait(timeout=15)
                except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
                return False
            time.sleep(5)
        return process.returncode==0
if __name__=='__main__':
    lock=open('/run/olamide-didww-worker.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    while True:
        try:
            job=bridge('claim');heartbeat()
            if job.get('id'):
                try:ok=execute(job)
                except Exception:ok=False
                finally:
                    try:
                        config=CONFIG
                        value=json.loads(config.read_text());value.pop('apiKey',None)
                        temp=config.with_suffix('.tmp');temp.write_text(json.dumps(value));temp.chmod(0o600);temp.replace(config)
                    except Exception:pass
                bridge('finish',{'id':job['id'],'status':('verified' if job['mode']=='verify' else 'installed') if ok else 'failed'})
        except Exception:pass  # Service remains alive during API rebuilds; stale jobs are never auto-replayed.
        time.sleep(10)
