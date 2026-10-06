import { isAdmin } from './tenancy.js';

export async function handleCharging({req,res,user,pool,send}){
  if(!isAdmin(user)) return send(res,403,{error:'Administrator required'});
  if(req.method!=='GET') return send(res,405,{error:'Method unavailable'});
  const tenant=user.tenant_id;
  const [cdr,rates,invoices,orders,carriers,wallet]=await Promise.all([
    pool.query('SELECT COUNT(*) AS total FROM cdr_records WHERE tenant_id=$1',[tenant]),
    pool.query('SELECT COUNT(*) AS total FROM pbx_rates WHERE tenant_id=$1 AND enabled=TRUE',[tenant]),
    pool.query("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN i.currency='USD' THEN i.amount_cents ELSE 0 END),0) AS cents FROM invoices i JOIN users u ON u.id=i.user_id WHERE u.tenant_id=$1 AND i.status='unpaid'",[tenant]),
    pool.query("SELECT COUNT(*) AS total FROM dialplan_orders WHERE tenant_id=$1 AND status='pending_payment'",[tenant]),
    pool.query("SELECT COUNT(*) AS total FROM carrier_provider_profiles WHERE tenant_id=$1 AND status='active'",[tenant]),
    pool.query("SELECT COALESCE(SUM(balance_cents),0) AS cents FROM wallet_accounts WHERE tenant_id=$1 AND currency='USD'",[tenant])
  ]);
  return send(res,200,{cdrCount:Number(cdr.rows[0].total),rateCount:Number(rates.rows[0].total),
    unpaidInvoices:Number(invoices.rows[0].total),unpaidCents:Number(invoices.rows[0].cents),
    pendingDialplans:Number(orders.rows[0].total),activeCarriers:Number(carriers.rows[0].total),
    walletLiabilityCents:Number(wallet.rows[0].cents),
    liveRating:false,prepaidEnforcement:false,settlement:false,
    note:'CDRs are unrated. Invoice and wallet totals are not switch-enforced charges.'});
}
