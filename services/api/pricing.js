import { randomUUID } from "node:crypto";
import { isAdmin } from "./tenancy.js";

export const SOURCES=["flowroute","didww","inhouse"];
export function validRule(rule) {
  return rule && ["percent","fixed","manual"].includes(rule.mode) &&
    [rule.setupValue,rule.monthlyValue].every(value=>Number.isSafeInteger(value) &&
      (rule.mode==="percent" ? value>=-10000 && value<=100000 :
        rule.mode==="fixed" ? value>=-10000000 && value<=10000000 : value>=0 && value<=10000000));
}
export function sellingCents(cost,mode,value) {
  if (!Number.isSafeInteger(cost) || cost<0 || cost>10000000 ||
      !validRule({mode,setupValue:value,monthlyValue:value})) throw new RangeError("Invalid price rule");
  const price=mode==="manual"?value:mode==="percent"?
    Math.ceil(cost*(10000+value)/10000):cost+value;
  if (price>10000000) throw new RangeError("Selling price exceeds 10,000,000 cents");
  return Math.max(0,price);
}
export async function migratePricing(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS did_pricing_rules (
    tenant_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,
    mode VARCHAR(16) NOT NULL,setup_value INT NOT NULL,monthly_value INT NOT NULL,
    updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY(tenant_id,provider),FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
  for(const [name,definition] of [["buy_setup_cents","INT UNSIGNED NOT NULL DEFAULT 0"],["buy_monthly_cents","INT UNSIGNED NOT NULL DEFAULT 0"],["price_mode","VARCHAR(16) NOT NULL DEFAULT 'manual'"]]) {
    const found=await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='inhouse_dids' AND column_name=$1",[name]);
    if (!found.rowCount) await pool.query(`ALTER TABLE inhouse_dids ADD COLUMN ${name} ${definition}`);
  }
}
export async function pricingRule(pool,tenant,provider) {
  const result=await pool.query("SELECT mode,setup_value AS setupValue,monthly_value AS monthlyValue FROM did_pricing_rules WHERE tenant_id=$1 AND provider=$2",[tenant,provider]);
  if (result.rows[0]) return result.rows[0];
  if (provider!=="inhouse") {
    const legacy=await pool.query("SELECT value FROM tenant_settings WHERE tenant_id=$1 AND setting_key='did_markup_bps'",[tenant]);
    if (legacy.rows[0]) return {mode:"percent",setupValue:Number(legacy.rows[0].value),monthlyValue:Number(legacy.rows[0].value)};
  }
  return {mode:"percent",setupValue:3000,monthlyValue:3000};
}
export async function handlePricing({req,res,path,user,pool,send,readJson}) {
  if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
  if (path==="/api/admin/pricing/preview" && req.method==="POST") {
    const {mode,setupValue,monthlyValue,buySetup,buyMonthly}=await readJson(req);
    if (!validRule({mode,setupValue,monthlyValue}) ||
        ![buySetup,buyMonthly].every(value=>Number.isSafeInteger(value) && value>=0 && value<=10000000))
      return send(res,400,{error:"Valid pricing rule and buy costs in cents required"});
    try {return send(res,200,{setupCents:sellingCents(buySetup,mode,setupValue),
      monthlyCents:sellingCents(buyMonthly,mode,monthlyValue)});}
    catch {return send(res,400,{error:"Calculated selling price exceeds limit"});}
  }
  if (path==="/api/admin/pricing" && req.method==="GET") {
    const rules=await Promise.all(SOURCES.map(async provider=>({provider,...await pricingRule(pool,user.tenant_id,provider)})));
    return send(res,200,{rules,note:"Provider buying costs come from live provider inventory. In-house costs are administrator-entered estimates. Changes to rules affect subsequent searches and reservations only."});
  }
  const match=/^\/api\/admin\/pricing\/(flowroute|didww|inhouse)$/.exec(path);
  if (match && req.method==="PUT") {
    const {mode,setupValue,monthlyValue}=await readJson(req);
    if (!validRule({mode,setupValue,monthlyValue})) return send(res,400,{error:"Invalid pricing mode or setup/monthly values"});
    if (match[1]==="inhouse") {
      const maximum=await pool.query("SELECT MAX(buy_setup_cents) AS setup_cost,MAX(buy_monthly_cents) AS monthly_cost FROM inhouse_dids WHERE tenant_id=$1 AND price_mode='rule' AND status IN ('available','unverified','disabled')",[user.tenant_id]);
      try {
        if (maximum.rows[0]?.setup_cost!=null) sellingCents(Number(maximum.rows[0].setup_cost),mode,setupValue);
        if (maximum.rows[0]?.monthly_cost!=null) sellingCents(Number(maximum.rows[0].monthly_cost),mode,monthlyValue);
      } catch {return send(res,400,{error:"Rule exceeds maximum selling price for current in-house inventory"});}
    }
    await pool.query("INSERT INTO did_pricing_rules(tenant_id,provider,mode,setup_value,monthly_value,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE mode=VALUES(mode),setup_value=VALUES(setup_value),monthly_value=VALUES(monthly_value),updated_by=VALUES(updated_by)",
      [user.tenant_id,match[1],mode,setupValue,monthlyValue,user.id]);
    await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,$4)",
      [randomUUID(),user.tenant_id,user.id,`did_pricing_${match[1]}`]);
    return send(res,200,{provider:match[1],mode,setupValue,monthlyValue});
  }
  return send(res,404,{error:"Pricing route unavailable"});
}
