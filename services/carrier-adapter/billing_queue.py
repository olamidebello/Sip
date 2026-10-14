#!/usr/bin/env python3
"""Durable loopback queue for trusted Kamailio dialog billing events."""
from contextlib import contextmanager
import hmac,json,pathlib,sqlite3,threading,time,urllib.request
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

@contextmanager
def connection(path):
    db=sqlite3.connect(path,timeout=5);db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA synchronous=FULL')
    db.execute('CREATE TABLE IF NOT EXISTS events(call_key TEXT,event TEXT,payload TEXT,done INTEGER DEFAULT 0,PRIMARY KEY(call_key,event))')
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback();raise
    finally:db.close()
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        cfg=self.server.config
        if self.path!='/event' or not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+cfg['token']):return self.reply(401)
        try:
            self.connection.settimeout(3);n=int(self.headers.get('Content-Length','0'))
            if not 0<n<4096:raise ValueError('size')
            b=json.loads(self.rfile.read(n));import re
            if not re.fullmatch('[a-f0-9]{64}',b.get('callKey','')) or b.get('event') not in ['start','end','failed'] or type(b.get('epoch')) is not int:raise ValueError('event')
            with connection(cfg['database']) as db:db.execute('INSERT OR IGNORE INTO events(call_key,event,payload) VALUES(?,?,?)',(b['callKey'],b['event'],json.dumps(b)))
            self.reply(200)
        except Exception:self.reply(503)
    def reply(self,code):
        self.send_response(code);self.send_header('Content-Length','0');self.end_headers()
def worker(cfg):
    while True:
        try:
            with connection(cfg['database']) as db:rows=db.execute('SELECT call_key,event,payload FROM events WHERE done=0 ORDER BY rowid LIMIT 50').fetchall()
            for key,event,payload in rows:
                req=urllib.request.Request(cfg['api'],data=payload.encode(),headers={'Authorization':'Bearer '+cfg['token'],'Content-Type':'application/json'})
                try:
                    with urllib.request.urlopen(req,timeout=5) as response:
                        if response.status!=200:continue
                    with connection(cfg['database']) as db:db.execute('UPDATE events SET done=1 WHERE call_key=? AND event=?',(key,event))
                except Exception:pass # Keep pending events durably for retry/reconciliation.
        except Exception:pass
        time.sleep(3)
def main():
    import argparse,os
    p=argparse.ArgumentParser();p.add_argument('--config',required=True);cfg=json.loads(pathlib.Path(p.parse_args().config).read_text());os.umask(0o077)
    with connection(cfg['database']):pass
    threading.Thread(target=worker,args=(cfg,),daemon=True).start()
    server=ThreadingHTTPServer(('127.0.0.1',18444),Handler);server.config=cfg;server.serve_forever()
if __name__=='__main__':main()
