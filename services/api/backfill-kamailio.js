import {createDecipheriv} from 'node:crypto';
import {createDatabase} from './db.js';
import {syncKamailioCredential} from './kamailio.js';

function decrypt(ciphertext,key){
  const data=Buffer.from(ciphertext);
  if(data.length<29)throw new Error('Invalid SIP secret');
  const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
  cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString('utf8');
}
export async function backfillKamailio(pool,key){
  const rows=await pool.query(`SELECT a.id,a.username,a.domain,a.secret_cipher
    FROM sip_accounts a JOIN users u ON u.id=a.user_id AND u.status='active'
    JOIN tenants n ON n.id=a.tenant_id AND n.status='active'
    JOIN switch_tenants t ON t.tenant_id=a.tenant_id AND t.domain=a.domain AND t.enabled=TRUE
    WHERE a.status='active' AND a.secret_cipher IS NOT NULL`);
  let count=0;
  for(const row of rows.rows){
    const password=decrypt(row.secret_cipher,key);
    await syncKamailioCredential(pool,{accountId:row.id,username:row.username,domain:row.domain,password});
    count++;
  }
  return count;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const raw=process.env.SIP_CREDENTIAL_KEY||'';
  if(!/^[0-9a-f]{64}$/i.test(raw))throw new Error('Set SIP_CREDENTIAL_KEY privately');
  const pool=createDatabase(process.env.MYSQL_URL);
  try{
    const count=await backfillKamailio(pool,Buffer.from(raw,'hex'));
    console.log('Synchronized '+count+' active SIP accounts');
  }finally{await pool.end();}
}
