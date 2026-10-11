import {createHash} from 'node:crypto';
const md5=value=>createHash('md5').update(value).digest('hex');
export function sipDigest(username,domain,password){
  if(!/^[a-z0-9]{2,64}$/i.test(username)||!/^[-a-z0-9.]{1,253}$/i.test(domain)||typeof password!=='string'||password.length<32)throw Error('Invalid SIP credential');
  return {ha1:md5(`${username}:${domain}:${password}`),ha1b:md5(`${username}@${domain}:${domain}:${password}`)};
}
export async function migrateKamailioAccounts(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS olamide_sip_subscribers (
    account_id CHAR(36) PRIMARY KEY,username VARCHAR(64) NOT NULL,domain VARCHAR(255) NOT NULL,
    ha1 CHAR(32) NOT NULL,ha1b CHAR(32) NOT NULL,UNIQUE KEY sip_identity(username,domain),
    FOREIGN KEY(account_id) REFERENCES sip_accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE OR REPLACE SQL SECURITY DEFINER VIEW olamide_sip_auth AS
    SELECT c.account_id AS id,c.username,c.domain,c.ha1,c.ha1b,'' AS rpid
    FROM olamide_sip_subscribers c JOIN sip_accounts a ON a.id=c.account_id AND a.username=c.username AND a.domain=c.domain
    JOIN users u ON u.id=a.user_id AND u.tenant_id=a.tenant_id JOIN tenants t ON t.id=a.tenant_id
    WHERE a.status='active' AND u.status='active' AND t.status='active'`);
}
export async function provisionKamailioAccount(pool,account,password){
  const hash=sipDigest(account.username,account.domain,password);
  await pool.query('INSERT INTO olamide_sip_subscribers(account_id,username,domain,ha1,ha1b) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE username=VALUES(username),domain=VALUES(domain),ha1=VALUES(ha1),ha1b=VALUES(ha1b)',[account.id,account.username,account.domain,hash.ha1,hash.ha1b]);
}
