import {createDatabase} from './db.js';
import {credentialKey} from './sipMarketplace.js';
import {repairedCredential} from './repairSipDomain.js';
import {provisionKamailioAccount} from './kamailioAccounts.js';
export async function refreshSipAuth(pool,{domain,key=credentialKey(),mode=process.env.SIP_PROVISION_MODE,apply=false}){
 if(mode!=='kamailio_local'||!/^[-a-z0-9.]{1,253}$/i.test(domain||'')||/\.sip\.flowroute\.com$/i.test(domain))throw Error('Configured local SIP realm required');
 const db=await pool.connect();try{await db.query('BEGIN');const result=await db.query('SELECT id,username,domain,secret_cipher,status FROM sip_accounts WHERE domain=$1 ORDER BY id FOR UPDATE',[domain]);const entries=result.rows.map(account=>repairedCredential(account,key,domain));if(apply)for(const entry of entries)await provisionKamailioAccount(db,entry.account,entry.password);await db.query(apply?'COMMIT':'ROLLBACK');return {accounts:entries.length,applied:apply};}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
if(process.argv[1]?.endsWith('/refreshSipAuth.js')){const pool=createDatabase(process.env.MYSQL_URL);try{console.log(JSON.stringify(await refreshSipAuth(pool,{domain:process.env.SIP_ACCOUNT_DOMAIN,apply:process.argv.includes('--apply')})));}catch(error){console.error('Subscriber authentication refresh failed: '+(error.code||error.name));process.exitCode=1;}finally{await pool.end();}}
