import {profileMissing,getServiceCountries,countryCatalog} from './serviceCountries.js';
import {validateLocale} from './locales.js';
export function readiness({profile={},settings,preferences}={}){
 const missing=profileMissing(profile);
 if(!/^\+[1-9]\d{7,14}$/.test(profile.phone_e164||'')&&!missing.includes('phone_e164'))missing.push('phone_e164');
 if(!countryCatalog.some(c=>c.code===profile.country)&&!missing.includes('country'))missing.push('country');
 if(!settings?.countries?.length)missing.push('service_countries');
 if(!settings?.countries?.includes(settings?.primaryCountry))missing.push('primary_country');
 try{validateLocale(typeof preferences==='string'?JSON.parse(preferences):preferences);}catch{missing.push('language_currency_preferences');}
 return {complete:missing.length===0,missing,landingPage:missing.length?'account':null,checkedAt:new Date().toISOString()};
}
export async function getProfileReadiness(pool,user){
 const [profile,settings,locale]=await Promise.all([pool.query('SELECT phone_e164,address_line1,address_line2,city,region,postal_code,country FROM user_profiles WHERE user_id=$1',[user.id]),getServiceCountries(pool,user.tenant_id,user.id),pool.query('SELECT preferences FROM user_locales WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])]);
 return readiness({profile:profile.rows[0],settings,preferences:locale.rows[0]?.preferences});
}
