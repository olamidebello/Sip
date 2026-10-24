import {randomUUID} from 'node:crypto';
import {validateRegistration} from './security.js';
export function signupInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Object.assign(Error('Invalid registration form'),{registrationValidation:true});
 try{
  const data=validateRegistration(input);
  if(input.pin!==undefined&&input.pin!==''&&(typeof input.pin!=='string'||!/^\d{6,8}$/.test(input.pin)||/^(\d)\1+$/.test(input.pin)||['123456','1234567','12345678','87654321','7654321','654321'].includes(input.pin)))throw Error('Choose a nontrivial account PIN of 6 to 8 digits, or leave it blank when optional');
  return data;
 }catch(e){throw Object.assign(Error(e.message),{registrationValidation:true});}
}
export function registrationFailure(error,log=console.error){
 if(error.signupLimited)return {status:429,body:{error:error.message,retryAfter:600,captchaConsumed:false}};
 if(error.registrationValidation)return {status:400,body:{error:error.message,captchaConsumed:false}};
 if(error instanceof SyntaxError||['Invalid JSON object','Request too large'].includes(error.message))return {status:400,body:{error:'Invalid registration request',captchaConsumed:false}};
 const reference=randomUUID(),code=/^[A-Z][A-Z0-9_]{1,60}$/.test(error.code||'')?error.code:error.name==='TypeError'?'TYPE_ERROR':'REGISTRATION_ERROR';
 log('Registration failure',JSON.stringify({reference,code}));
 const unavailable=['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR','ER_NO_REFERENCED_ROW_2','ER_CHECK_CONSTRAINT_VIOLATED','ER_DATA_TOO_LONG','ECONNREFUSED','ETIMEDOUT','PROTOCOL_CONNECTION_LOST','ER_LOCK_WAIT_TIMEOUT','ER_LOCK_DEADLOCK'].includes(code);
 return {status:unavailable?503:500,body:{error:'Registration is temporarily unavailable. Please contact support with reference '+reference+'.',reference,code:'REGISTRATION_UNAVAILABLE'}};
}
export async function safeRegistration(run,context){
 try{return await run({...context,readJson:async req=>{const body=await context.readJson(req);if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(Error('Invalid registration form'),{registrationValidation:true});return body;}});}catch(error){const result=registrationFailure(error);return context.send(context.res,result.status,result.body);}
}
