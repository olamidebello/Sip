import fs from 'node:fs';
import {isAdmin} from './tenancy.js';
export const telecomFeatures=JSON.parse(fs.readFileSync(new URL('./telecomFeatureCatalog.json',import.meta.url),'utf8'));
export async function handleTelecomFeatures({req,res,user,send}){
 if(!isAdmin(user))return send(res,403,{error:'Administrator required'});
 if(req.method!=='GET')return send(res,405,{error:'Read-only capability catalog; feature activation is not supported here'});
 const superTargets=new Set(['navigation-policy-admin','tenant-admin']);
 return send(res,200,{architecture:'kamailio',fullParity:false,features:telecomFeatures.map(f=>({...f,target:superTargets.has(f.target)&&user.role!=='super_admin'?null:f.target})),scope:'Implementation inventory, not proof of installed provider integrations or call acceptance.'});
}
