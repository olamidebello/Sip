import {dialingDefaults,readDialingPolicy} from './dialingPolicy.js';
import {readFileSync} from 'node:fs';
// Calling codes and numeric trunk prefixes generated from python-phonenumbers metadata.
const countries=JSON.parse(readFileSync(new URL('./dialingCountries.json',import.meta.url),'utf8'));
export function expandLocalDestination(raw,country,profilePhone='',settings=dialingDefaults){
 const value=String(raw);
 if(!/^\+?\d{3,20}$/.test(value))throw Error('Enter a phone number with optional +');
 if(value.startsWith('+'))return value;
 const region=countries[String(country||'').toUpperCase()];
 const idd=region&&new RegExp('^(?:'+region.idd+')').exec(value)?.[0];
 if(idd){
  if(!settings.stripIdd)return value;
  const international=value.slice(idd.length);
  if(!/^[1-9]\d{7,14}$/.test(international))throw Error('Enter a complete international number after the IDD prefix');
  return international;
 }
 // Preserve explicit international digits so country codes are never doubled.
 if(value.length>10&&Object.values(countries).some(r=>value.startsWith(r.code)))return value;
 if(!region)throw Error('Set your profile country before dialing a local number');
 if(value.length===7){
  if(!settings.prefixSeven)return value;
  const phone=String(profilePhone||'');
  if(!/^\+[1-9]\d{7,14}$/.test(phone)||!phone.slice(1).startsWith(region.code))throw Error('Set a valid profile phone number matching your profile country for seven-digit dialing');
  const nationalPhone=phone.slice(1+region.code.length);
  if(nationalPhone.length<3)throw Error('Profile phone number must include a three-digit local prefix');
  return region.code+nationalPhone.slice(0,3)+value;
 }
 if(value.length===10?!settings.prefixTen:!settings.prefixOther)return value;
 let national=value;
 if(settings.stripTrunk&&region.trunk!==region.code&&region.trunk&&national.startsWith(region.trunk))national=national.slice(region.trunk.length);
 return region.code+national;
}
export async function profileDestination(db,tenant,user,raw){
 if(String(raw).startsWith('+'))return raw;
 const profile=(await db.query('SELECT p.country,p.phone_e164 FROM user_profiles p JOIN users u ON u.id=p.user_id WHERE u.id=$1 AND u.tenant_id=$2',[user,tenant])).rows[0];
 const policy=await readDialingPolicy(db,tenant,user);
 return expandLocalDestination(raw,profile?.country,profile?.phone_e164,policy.settings);
}
