export function signupFailureNotice(error){
 const status=Number(error?.status||0),reference=error?.reference?' Reference: '+error.reference+'.':'';
 if(!status||status>=500)return {refreshCaptcha:true,text:'Registration could not be confirmed. Check sign-in or Resume phone verification before submitting another account request.'+reference+' If neither works, registration may be temporarily unavailable.'};
 if(status===409)return {refreshCaptcha:true,text:(error.message||'Account may already exist')+' Use Login or Resume phone verification if you already registered.'};
 if(status===429)return {refreshCaptcha:false,text:'Too many registration attempts. Wait'+(error.retryAfter?' '+error.retryAfter+' seconds':' a few minutes')+' before trying again.'};
 return {refreshCaptcha:error?.captchaConsumed!==false,text:error?.message||'Check the registration form and try again.'};
}
export async function accountJson(response){
 let data;try{data=await response.json();}catch{const e=Error('Account service returned an unreadable response. The previous request may have completed; check sign-in or verification before retrying.');e.status=response.status||502;throw e;}
 if(!response.ok){const e=Error(typeof data?.error==='string'?data.error:'Account request failed');e.status=response.status;e.code=data?.code;e.reference=typeof data?.reference==='string'?data.reference:undefined;e.captchaConsumed=typeof data?.captchaConsumed==='boolean'?data.captchaConsumed:undefined;const retry=Number(response.headers.get('Retry-After')||data?.retryAfter);if(Number.isFinite(retry)&&retry>0)e.retryAfter=retry;throw e;}
 return data;
}
