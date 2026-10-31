"""Preserve host customizations while adding the calling budget workflow."""
from pathlib import Path
import sys


def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('Calling plan integration anchor missing or ambiguous: '+old[:70])
    return source.replace(old, new, 1)


def server(source):
    if '// CALLING_PLAN_BUILDER_V1' in source:
        return source
    source = "import {migrateCallingPlans,handleCallingPlans,startCallingPlanFunding} from './callingPlanBuilder.js';\n"+source
    source = once(source, 'await migratePstnBilling(pool);', 'await migratePstnBilling(pool);\n// CALLING_PLAN_BUILDER_V1\nawait migrateCallingPlans(pool);\nconst stopCallingPlanFunding=startCallingPlanFunding(pool);')
    return once(source, '      if (path === "/api/billing/invoices"', "      if(path.startsWith('/api/billing/calling-plans'))return await handleCallingPlans({req,res,path,user,pool,send,readJson});\n      if (path === \"/api/billing/invoices\"")


def mainjs(source):
    if '// CALLING_PLAN_BUILDER_V1' in source:
        return source
    source = "import {setupCallingPlanBuilder} from './callingPlanBuilderUi.js';\n"+source
    return once(source, 'let recentCalls = [],softphoneUserId=null,softphoneLoad=0;', "let recentCalls = [],softphoneUserId=null,softphoneLoad=0;\n// CALLING_PLAN_BUILDER_V1\nsetupCallingPlanBuilder({document,get:apiGet,request:accountRequest,getUserId:()=>softphoneUserId,show:showWorkspace,refreshBilling});")


def wallet_purchase(source):
    if '// CALLING_PLAN_FUNDING_GUARD_V1' in source:
        return source
    return once(source, "  if(!invoice)return await reject('Invoice unavailable',404);", """  if(!invoice)return await reject('Invoice unavailable',404);
  // CALLING_PLAN_FUNDING_GUARD_V1
  if((await db.query('SELECT id FROM custom_calling_plans WHERE invoice_id=$1',[invoiceId])).rows.length)return await reject('Calling plan funding requires an external payment; existing balance is used when creating the plan');""")


def wallet(source):
    if '// CALLING_PLAN_FUNDING_HISTORY_V1' in source:
        return source
    # Extend the fetched entries before the existing response is assembled.
    # Host funding integrations may already merge other ledger entries in that
    # response; replacing its entries expression would discard those changes.
    return once(source, '    const purchases=await pool.query(', """    // CALLING_PLAN_FUNDING_HISTORY_V1
    const callingPlanCredits=await pool.query('SELECT plan_id AS id,amount_cents AS delta_cents,balance_after_cents,created_at FROM calling_plan_funding WHERE user_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 50',[user.id,user.tenant_id]);
    entries.rows.push(...callingPlanCredits.rows);
    const purchases=await pool.query(""")


def install(root):
    here=Path(__file__).resolve().parents[1]
    edits=[]
    for name, patch in [('services/api/server.js',server),('apps/web/src/main.js',mainjs),('services/api/walletPurchases.js',wallet_purchase),('services/api/wallet.js',wallet)]:
        target=root/name
        if target.is_symlink():raise ValueError('Symlink target rejected')
        edits.append((target,patch(target.read_text())))
    for name in ['services/api/callingPlanBuilder.js','apps/web/src/callingPlanBuilderUi.js']:
        target=root/name
        if target.is_symlink():raise ValueError('Symlink target rejected')
        edits.append((target,(here/name).read_text()))
    for target,source in edits:target.write_text(source)
    print('Calling plan builder integrated; current billing, gateways and live call rating preserved.')

if __name__=='__main__':install(Path(sys.argv[1]).resolve())
