export function creditState(wallet,scope='external',threshold=100){
 if(scope==='internal')return {free:true,blocked:false,low:false};
 const cents=Number(wallet?.balanceCents);if(wallet?.currency!=='USD'||!Number.isSafeInteger(cents))return {blocked:false,low:false,unknown:true};
 return {blocked:cents<=0,low:cents>0&&cents<threshold,cents};
}
export function setupCallCredit({document,get,show,isSignedIn=()=>true}){
 const host=document.getElementById('calling-workspace');const warning=document.createElement('div');warning.hidden=true;warning.setAttribute('role','status');const text=document.createElement('p'),top=document.createElement('button');top.type='button';top.textContent='Top up account';warning.append(text,top);host?.prepend(warning);
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Call credit required');const title=document.createElement('h2'),message=document.createElement('p'),fund=document.createElement('button'),close=document.createElement('button');title.textContent='Top up to make this call';fund.type=close.type='button';fund.textContent='Top up account';close.textContent='Cancel';dialog.append(title,message,fund,close);document.body.append(dialog);
 const dismiss=()=>{if(dialog.open)dialog.close();else dialog.hidden=true;};
 const billing=()=>{dismiss();show('billing');const balance=document.getElementById('wallet-balance');balance?.scrollIntoView?.({block:'center'});};top.onclick=fund.onclick=billing;close.onclick=dismiss;
 function prompt(){message.textContent='There is not enough available credit for this paid call. Top up your account, then dial again. Calls to assigned in-house numbers remain free.';if(dialog.showModal){if(!dialog.open)dialog.showModal();}else{dialog.hidden=false;dialog.setAttribute('role','alertdialog');fund.focus();}}
 async function check(scope,promptBlocked=true){if(scope==='internal')return true;if(!isSignedIn()){warning.hidden=true;return false;}try{const state=creditState(await get('/api/wallet'),scope);warning.hidden=!(state.low||state.blocked);if(!warning.hidden)text.textContent=state.blocked?'No available call credit. Top up before calling an outside number.':'Low call balance: $'+(state.cents/100).toFixed(2)+'. Top up soon.';if(state.blocked){if(promptBlocked)prompt();return false;}return true;}catch{return true;}}
 return {beforeCall:check,rejected(response){if(Number(response?.message?.statusCode||response?.statusCode)===402)prompt();},afterCall(){setTimeout(()=>void check('external',false),5000);}};
}
