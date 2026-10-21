from pathlib import Path
p=Path('/opt/olamide/repo/services/api/pstnBilling.js')
s=p.read_text()
marker='// OLAMIDE_FLOWROUTE_COST_PLUS_30_V1'
if marker not in s:
 anchor="  const shadow=selectShadowRate(policies,destination);"
 old="  if(override)Object.assign(rate,{price_usd_per_minute:override.data.rate,first_interval:override.data.first,sub_interval:override.data.step});"
 if s.count(anchor)!=1 or s.count(old)!=1:raise SystemExit('Unknown local billing layout; source unchanged')
 s=s.replace(old,old.replace('if(override)','if(override&&provider!==\'flowroute\')'))
 s=s.replace(anchor,marker+"\n  if(provider==='flowroute')Object.assign(rate,applyFlowrouteCustomerRate(rate));\n"+anchor)
 s="import {applyFlowrouteCustomerRate} from './flowrouteCustomerRate.js';\n"+s
 p.write_text(s)
