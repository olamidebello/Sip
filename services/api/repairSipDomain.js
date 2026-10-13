// Correct generated local subscribers only. Carrier profiles are separate tables.
import {createDecipheriv} from 'node:crypto';
import {credentialKey} from './sipMarketplace.js';
import {provisionKamailioAccount} from './kamailioAccounts.js';
import {createDatabase} from './db.js';
export function repairedCredential(account,key,to){
 if(!key||!account.secret_cipher)throw Error('Existing SIP encryption key and encrypted credential required');
 const data=Buffer.from(account.secret_cipher),decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));decipher.setAuthTag(data.subarray(-16));
 const password=Buffer.concat([decipher.update(data.subarray(12,-16)),decipher.final()]).toString('utf8');
 if(!/^ol[a-z0-9]{24}$/i.test(account.username)||password.length<32)throw Error('Only generated local SIP accounts can be repaired');
 return {account:{...account,domain:to},password};
}
export async function repairSipDomain(pool,{from,to,apply=false,key=credentialKey(),mode=process.env.SIP_PROVISION_MODE}){
 const domain=/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;
 if(!domain.test(from||'')||!domain.test(to||'')||from===to||/\.sip\.flowroute\.com$/i.test(to))throw Error('Distinct valid source and local target domains required');
 if(mode!=='kamailio_local')throw Error('Repair requires existing kamailio_local provisioning mode');
 const db=await pool.connect();
 try{await db.query('BEGIN');
 const result=await db.query('SELECT id,username,domain,secret_cipher,status FROM sip_accounts WHERE domain=$1 ORDER BY id FOR UPDATE',[from]);
 // Preflight every encrypted credential before the first write, including suspended accounts.
 const accounts=result.rows.map(account=>repairedCredential(account,key,to));
 if(apply)for(const entry of accounts){await db.query('UPDATE sip_accounts SET domain=$1 WHERE id=$2 AND domain=$3',[to,entry.account.id,from]);await provisionKamailioAccount(db,entry.account,entry.password);}
 await db.query(apply?'COMMIT':'ROLLBACK');return {from,to,accounts:accounts.length,applied:apply};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
if(process.argv[1]?.endsWith('/repairSipDomain.js')){
 const pool=createDatabase(process.env.MYSQL_URL);
 try{const result=await repairSipDomain(pool,{from:process.env.SIP_REPAIR_FROM,to:process.env.SIP_ACCOUNT_DOMAIN,apply:process.argv.includes('--apply')});console.log(JSON.stringify(result));}
 catch(error){console.error('Domain repair stopped: '+(/authenticate data/.test(error.message)?'Existing encryption key does not authenticate all credentials':error.message));process.exitCode=1;}
 finally{await pool.end();}
}
