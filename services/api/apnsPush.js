import {readFile} from 'node:fs/promises';
import {createSign} from 'node:crypto';
import {connect} from 'node:http2';
export function apnsAssertion(config,now=Math.floor(Date.now()/1000)) {
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const input=encode({alg:'ES256',kid:config.keyId})+'.'+encode({iss:config.teamId,iat:now});
 return input+'.'+createSign('SHA256').update(input).sign({key:config.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
}
export function apnsRequest(config,token,data) {
 if(!/^[a-f0-9]{32,512}$/i.test(token)||!/^com\.dobhrap\.olamide$/.test(config.bundleId)||!['sandbox','production'].includes(config.environment)||!/^\w{10}$/.test(config.teamId)||!/^\w{10}$/.test(config.keyId))throw Error('Invalid APNs configuration');
 return {host:config.environment==='production'?'https://api.push.apple.com':'https://api.sandbox.push.apple.com',headers:{':method':'POST',':path':'/3/device/'+token,authorization:'bearer '+apnsAssertion(config),'apns-topic':config.bundleId+'.voip','apns-push-type':'voip','apns-priority':'10','apns-expiration':'0'},body:JSON.stringify({aps:{},...data})};
}
let cached;
export async function sendApns(token,data) {
 const path=process.env.NATIVE_PUSH_APNS_CONFIG_FILE;
 // Cache provider JWT for 30 minutes; APNs rejects excessively frequent refreshes.
 if(!cached||cached.path!==path||cached.expires<Date.now()) {
  const config=JSON.parse(await readFile(path,'utf8'));
  const request=apnsRequest(config,token,data);
  cached={path,config,authorization:request.headers.authorization,expires:Date.now()+1800000};
 }
 const request=apnsRequest({...cached.config},token,data);request.headers.authorization=cached.authorization;
 await new Promise((resolve,reject)=>{
  const client=connect(request.host);let finished=false;
  const done=error=>{if(finished)return;finished=true;clearTimeout(timer);client.destroy();error?reject(error):resolve();};
  const timer=setTimeout(()=>done(Error('APNs timeout')),8000);
  client.on('error',done);const stream=client.request(request.headers);let status,body='';
  stream.on('response',headers=>{status=headers[':status'];});stream.on('data',chunk=>{body+=chunk;if(body.length>8192)done(Error('APNs response too large'));});stream.on('error',done);
  stream.on('end',()=>{if(status===200)return done();const error=Error('APNs delivery failed');let reason;try{reason=JSON.parse(body).reason;}catch{}error.unregistered=status===410||reason==='BadDeviceToken'||reason==='DeviceTokenNotForTopic';done(error);});stream.end(request.body);
 });
}
