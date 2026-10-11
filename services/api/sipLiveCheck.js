// Run inside the API container. Credentials and Digest headers are never printed.
import {randomBytes} from 'node:crypto';
import {registerDigest} from './sipRegisterDigest.js';
import WebSocket from 'ws';
import {createDatabase} from './db.js';
import {prepareSipProbeAccount} from './sipProbeAccount.js';
const pool=createDatabase(process.env.MYSQL_URL);
let ws,registered=false,account,seq=0;
const tag=randomBytes(8).toString('hex'),callId=randomBytes(16).toString('hex');
const contact=`sip:probe-${tag}@${tag}.invalid;transport=ws`;
function message(expires,authorization=''){
 const cseq=++seq;
 return `REGISTER sip:${account.domain} SIP/2.0\r\nVia: SIP/2.0/WSS ${tag}.invalid;branch=z9hG4bK${randomBytes(8).toString('hex')};rport\r\nMax-Forwards: 70\r\nTo: <sip:${account.username}@${account.domain}>\r\nFrom: <sip:${account.username}@${account.domain}>;tag=${tag}\r\nCall-ID: ${callId}\r\nCSeq: ${cseq} REGISTER\r\nContact: <${contact}>;expires=${expires}\r\nExpires: ${expires}\r\n${authorization}Content-Length: 0\r\n\r\n`;
}
function exchange(payload){return new Promise((resolve,reject)=>{
 const expected=/CSeq: (\d+) REGISTER/.exec(payload)[1];
 const timer=setTimeout(()=>done(Error('SIP response timeout')),8000);
 function done(error,result){clearTimeout(timer);ws.off('message',onMessage);ws.off('close',onClose);error?reject(error):resolve(result);}
 function onClose(){done(Error('WebSocket closed during registration'));}
 function onMessage(bytes){const s=bytes.toString();const match=/^SIP\/2.0 (\d+)/.exec(s);if(match&&new RegExp('^CSeq: '+expected+' REGISTER','im').test(s)&&Number(match[1])>=200)done(null,{code:Number(match[1]),text:s});}
 ws.on('message',onMessage);ws.once('close',onClose);ws.send(payload);
});}

try{
 const id=process.env.SIP_CHECK_USER_ID;
 account=await prepareSipProbeAccount(pool,id);
 ws=new WebSocket(account.wssUrl,'sip',{origin:process.env.PUBLIC_ORIGIN,handshakeTimeout:8000});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',()=>reject(Error('Secure WebSocket handshake failed')));});
 console.log('Secure WebSocket: PASS');
 let result=await exchange(message(60));
 if(result.code===401||result.code===407)result=await exchange(message(60,registerDigest(account,result)));
 if(result.code!==200)throw Error('REGISTER returned SIP '+result.code);
 registered=true;console.log('Authenticated SIP REGISTER: PASS');
 let removal=await exchange(message(0));if(removal.code===401||removal.code===407)removal=await exchange(message(0,registerDigest(account,removal)));
 if(removal.code!==200)throw Error('Probe contact cleanup returned SIP '+removal.code);
 registered=false;console.log('Probe contact cleanup: PASS');
 console.log('Two-way client audio: REQUIRES TEST CALL');
}catch(error){console.error('Live check: FAIL - '+error.message);if(registered)console.error('Probe contact expires within 60 seconds');process.exitCode=1;}
finally{ws?.terminate();await pool.end();}
