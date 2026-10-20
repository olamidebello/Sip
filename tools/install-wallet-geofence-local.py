#!/usr/bin/env python3
"""Stage additive wallet edits and three-way geofence merges before writing files."""
import subprocess
import tempfile
from pathlib import Path

WALLET='f8c49616f006fbee2986cee62e2d97d3e9add4e4'
GEO='4dd4bdbb5debc504c82bd0af45387c9be7ccc17b'

def insert_once(text, marker, anchor, addition):
    if marker in text:
        return text
    if text.count(anchor)!=1:
        raise RuntimeError('Expected one integration anchor: '+anchor)
    return text.replace(anchor,addition+anchor,1)

def wallet_edits(wallet,main):
    if "from './walletPurchases.js'" not in wallet:
        wallet="import {migrateWalletPurchases,handleWalletPurchase} from './walletPurchases.js';\n"+wallet
    if 'await migrateWalletPurchases(pool)' not in wallet:
        anchor='await migrateMoneyRequests(pool);'
        if wallet.count(anchor)!=1: raise RuntimeError('Wallet migration anchor missing')
        wallet=wallet.replace(anchor,anchor+'\n  await migrateWalletPurchases(pool);',1)
    wallet=insert_once(wallet,"path==='/api/wallet/purchases'", "  if(path==='/api/wallet/payment-card'", "  if(path==='/api/wallet/purchases')return handleWalletPurchase({req,res,user,pool,send,readJson});\n")
    if 'purchases:purchases.rows' not in wallet:
        anchor='    return send(res,200,{balanceCents:'
        if wallet.count(anchor)!=1: raise RuntimeError('Wallet response anchor missing')
        wallet=wallet.replace(anchor,"    const purchases=await pool.query('SELECT id,invoice_id,amount_cents,balance_after_cents,created_at FROM wallet_purchases WHERE user_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 50',[user.id,user.tenant_id]);\n    return send(res,200,{purchases:purchases.rows,balanceCents:",1)
    if "payBalance.textContent='Pay with account balance'" not in main:
        anchor="    if(invoice.status==='unpaid'&&invoice.currency==='USD'&&Number(invoice.amount_cents)>0){"
        if main.count(anchor)!=1: raise RuntimeError('Invoice checkout anchor missing')
        main=main.replace(anchor,anchor+"""
      const payBalance=document.createElement('button');payBalance.type='button';payBalance.textContent='Pay with account balance';
      payBalance.disabled=Number(wallet.availableBalanceCents??wallet.balanceCents)<Number(invoice.amount_cents);
      if(payBalance.disabled)payBalance.title='Insufficient available account balance';
      payBalance.onclick=async()=>{
        if(!confirm(`Pay ${money(invoice.amount_cents)} from your available account balance?`))return;
        payBalance.disabled=true;
        try{await accountRequest('/api/wallet/purchases',{invoiceId:invoice.id});$('#checkout-status').textContent='Paid from account balance.';await refreshBilling();}
        catch(error){$('#checkout-status').textContent=error.message;payBalance.disabled=false;}
      };li.append(payBalance);
""",1)
    if 'wallet.purchases||[]' not in main:
        anchor='...wallet.entries.map(entry=>{'
        if main.count(anchor)!=1: raise RuntimeError('Wallet history anchor missing')
        main=main.replace(anchor,"...[...wallet.entries,...(wallet.purchases||[]).map(p=>({...p,delta_cents:-Number(p.amount_cents),type:'purchase'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,50).map(entry=>{",1)
        # Retain production top-up/manual-credit labels and add the purchase label.
        main=main.replace('${entry.type===', '${entry.type===\'purchase\'?"Purchase":entry.type===',1) if '${entry.type===' in main else main.replace('${Number(entry.delta_cents)>=0?', '${entry.type===\'purchase\'?"Purchase":Number(entry.delta_cents)>=0?',1)
    return wallet,main

def install(root):
    def git(*args):return subprocess.check_output(['git',*args],cwd=root)
    def source(ref,path):return git('show',ref+':'+path)
    for ref in (WALLET,GEO):subprocess.run(['git','merge-base','--is-ancestor',ref,'origin/main'],cwd=root,check=True)
    pending={}
    wallet,main=wallet_edits((root/'services/api/wallet.js').read_text(),(root/'apps/web/src/main.js').read_text())
    pending['services/api/wallet.js']=wallet.encode()
    pending['apps/web/src/main.js']=main.encode()
    for path in ('services/api/walletPurchases.js','services/api/walletPurchases.test.js'):
        value=source(WALLET,path)
        if (root/path).exists() and (root/path).read_bytes()!=value:raise RuntimeError('Existing custom file requires review: '+path)
        pending[path]=value
    paths=git('diff-tree','--no-commit-id','--name-only','-r',GEO).decode().splitlines()
    with tempfile.TemporaryDirectory() as work:
        for path in paths:
            incoming=source(GEO,path)
            base_run=subprocess.run(['git','show',GEO+'^:'+path],cwd=root,capture_output=True)
            ours=pending.get(path,(root/path).read_bytes() if (root/path).exists() else None)
            if base_run.returncode:
                if ours is not None and ours!=incoming:raise RuntimeError('Existing custom file requires review: '+path)
                pending[path]=incoming;continue
            if ours is None:raise RuntimeError('Local file missing: '+path)
            if ours==incoming:continue
            files=[Path(work)/name for name in ('ours','base','incoming')]
            for file,data in zip(files,(ours,base_run.stdout,incoming)):file.write_bytes(data)
            merged=subprocess.run(['git','merge-file','-p',*map(str,files)],capture_output=True)
            if merged.returncode:raise RuntimeError('Three-way conflict; no files written: '+path)
            pending[path]=merged.stdout
    # No destination is written until every integration and merge is clean.
    for path,data in pending.items():
        dest=root/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    print('Wallet and geofence integrations applied; existing local wallet behavior preserved.')

if __name__=='__main__':install(Path('/opt/olamide/repo'))
