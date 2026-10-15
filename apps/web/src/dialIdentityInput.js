import {callAddressLabel,callIdentityLabel} from './callIdentity.js';
export const dialInputTarget=input=>input.dataset.routeTarget||input.value.trim();
export function setupDialIdentityInput({input,lookup,changed=()=>{}}){
 let generation=0,rendered=null;
 async function refresh(){
  if(input.dataset.routeTarget&&input.value===rendered)return;
  const address=input.value,token=++generation;
  delete input.dataset.routeTarget;rendered=null;input.placeholder='Phone number';
  if(!/^sips?:/i.test(address)){changed();return;}
  input.dataset.routeTarget=address;
  const render=label=>{rendered=label==='Name unavailable'?'':label;input.value=rendered;input.placeholder=rendered?'Phone number':'Name unavailable';changed();};
  render(callAddressLabel(address)||'Name unavailable');
  try{const label=await lookup(address);if(token===generation&&input.dataset.routeTarget===address)render(callIdentityLabel(address,label));}catch{/* Keep the phone number; never expose the routing address. */}
 }
 input.addEventListener('input',()=>void refresh());
 return {refresh};
}
