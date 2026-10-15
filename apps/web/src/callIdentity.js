// Never replace a known destination with a generic identity placeholder.
export function callAddressLabel(address){
 const value=String(address||'').trim().replace(/^sips?:/i,'').split(';')[0];
 const user=value.split('@')[0];
 return /^\+?[0-9*#]+$/.test(user)?user:'';
}
export function callIdentityLabel(address,label){
 const name=String(label||'').trim();
 return name&&!/[@]|^sips?:/i.test(name)&&!/^(Unknown caller|Registered SIP user|Olamide call)$/i.test(name)?name:(callAddressLabel(address)||'Name unavailable');
}
