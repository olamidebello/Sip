#!/usr/bin/env python3
"""Install additive porting hooks without replacing the production server or UI."""
from pathlib import Path
import argparse
import shutil
import time


def patched_server(s):
    imp="import {handleNumberPorting,migrateNumberPorting,startNumberPorting} from './numberPorting.js';"
    if imp not in s:
        s=imp+'\n'+s
    hook="      if(path.startsWith('/api/account/number-porting')||path.startsWith('/api/admin/number-porting'))return await handleNumberPorting({req,res,path,user,pool,send,readJson});"
    if hook not in s:
        anchor='      if (!user) return send(res, 401, { error: "Sign in required" });'
        if s.count(anchor)!=1:
            raise ValueError('Expected authenticated user hook missing; no files changed')
        s=s.replace(anchor,anchor+'\n'+hook)
    if 'await migrateNumberPorting(pool);' not in s:
        anchor='await migrate(pool);'
        if s.count(anchor)!=1:
            raise ValueError('Expected migration hook missing; no files changed')
        s=s.replace(anchor,anchor+'\nawait migrateNumberPorting(pool);')
    if 'const stopNumberPorting=startNumberPorting(pool);' not in s:
        anchor='server.listen(port, address, () =>'
        if s.count(anchor)!=1:
            raise ValueError('Expected server start hook missing; no files changed')
        s=s.replace(anchor,"const stopNumberPorting=startNumberPorting(pool);\nserver.on('close',stopNumberPorting);\n"+anchor)
    return s


def patched_ui(s):
    imp="import {showNumberPorting} from './numberPorting.js';"
    if imp not in s:
        s=imp+'\n'+s
    hook='  showNumberPorting({document,get:apiGet,request:accountRequest,user});'
    if hook not in s:
        anchor='  $("#signed-in-profile").hidden=false;'
        if s.count(anchor)!=1:
            raise ValueError('Expected signed-in profile hook missing; no files changed')
        s=s.replace(anchor,anchor+'\n'+hook)
    return s


def main():
    a=argparse.ArgumentParser()
    a.add_argument('--repo',default='/opt/olamide/repo')
    a.add_argument('--check',action='store_true')
    args=a.parse_args()
    root=Path(args.repo)
    patches=[]
    for relative,transform in [('services/api/server.js',patched_server),('apps/web/src/main.js',patched_ui)]:
        p=root/relative
        original=p.read_text()
        updated=transform(original)
        if original!=updated:
            patches.append((p,updated))
    if args.check:
        print('Porting integration compatible; pending files: '+str(len(patches)))
        return
    for p,s in patches:
        shutil.copy2(p,str(p)+'.before-number-porting-'+str(time.time_ns()))
        p.write_text(s)
    print('Porting integration changed files: '+str(len(patches)))


if __name__=='__main__':
    main()
