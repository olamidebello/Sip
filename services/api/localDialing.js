import {readFileSync} from 'node:fs';
// Calling codes and numeric trunk prefixes generated from python-phonenumbers metadata.
const countries=JSON.parse(readFileSync(new URL('./dialingCountries.json',import.meta.url),'utf8'));
export function expandLocalDestination(raw,country){
 const value=String(raw);
 if(!/^\+?\d{3,20}$/.test(value))throw Error('Enter a phone number with optional +');
 if(value.startsWith('+')||value.length>=10)return value;
 const region=countries[String(country||'').toUpperCase()];
 if(!region)throw Error('Set your profile country before dialing a local number');
 let national=value;
 if(region.trunk!==region.code&&region.trunk&&national.startsWith(region.trunk))national=national.slice(region.trunk.length);
 return region.code+national;
}
export async function profileDestination(db,tenant,user,raw){
 if(String(raw).startsWith('+')||String(raw).length>=10)return raw;
 const profile=(await db.query('SELECT p.country FROM user_profiles p JOIN users u ON u.id=p.user_id WHERE u.id=$1 AND u.tenant_id=$2',[user,tenant])).rows[0];
 return expandLocalDestination(raw,profile?.country);
}
