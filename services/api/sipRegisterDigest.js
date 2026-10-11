import {randomBytes,createHash} from 'node:crypto';
const md5=s=>createHash('md5').update(s).digest('hex');
export function registerDigest(account,response,cnonce=randomBytes(12).toString('hex')){
 const line=/^(?:WWW|Proxy)-Authenticate:\s*Digest (.+)$/im.exec(response.text)?.[1];if(!line)throw Error('Missing Digest challenge');
 const fields={};for(const m of line.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g))fields[m[1]]=m[2]??m[3];
 if(!fields.realm||!fields.nonce||(fields.algorithm&&fields.algorithm.toUpperCase()!=='MD5'))throw Error('Unsupported Digest challenge');
 const qop=fields.qop?.split(',').map(x=>x.trim()).includes('auth')?'auth':null;if(fields.qop&&!qop)throw Error('Unsupported Digest qop');
 const uri='sip:'+account.domain,nc='00000001';
 const ha1=md5(`${account.username}:${fields.realm}:${account.password}`),ha2=md5('REGISTER:'+uri);
 const hash=md5(qop?`${ha1}:${fields.nonce}:${nc}:${cnonce}:${qop}:${ha2}`:`${ha1}:${fields.nonce}:${ha2}`);
 const quote=v=>JSON.stringify(v);
 return `${response.code===407?'Proxy-Authorization':'Authorization'}: Digest username=${quote(account.username)}, realm=${quote(fields.realm)}, nonce=${quote(fields.nonce)}, uri=${quote(uri)}, response="${hash}", algorithm=MD5${fields.opaque?', opaque='+quote(fields.opaque):''}${qop?`, qop=auth, nc=${nc}, cnonce="${cnonce}"`:''}\r\n`;
}
