from pathlib import Path
root=Path('/opt/olamide/repo')
p=root/'services/api/pstnBilling.js'
s=p.read_text()
old='destination=normalizeDestination(data.destination,policies);'
new='destination=normalizeDestination(await profileDestination(db,actor.tenant_id,actor.user_id,data.destination),policies);'
if new not in s:
    if s.count(old)!=1: raise RuntimeError('Unexpected PSTN normalization integration; no file changed')
    s=s.replace(old,new)
    s="import {profileDestination} from './localDialing.js';\n"+s
p.write_text(s)
