import {randomUUID} from 'node:crypto';

// Append-only double-entry accounting for recorded charges, separate from the
// legacy transfer wallet. Every journal has equal debit and credit amounts.
export async function migrateBillingLedger(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS billing_journals (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,source_type VARCHAR(24) NOT NULL,
    source_id CHAR(36) NOT NULL,currency CHAR(3) NOT NULL DEFAULT 'USD',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),UNIQUE KEY journal_source(tenant_id,source_type,source_id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS billing_postings (
    id CHAR(36) PRIMARY KEY,journal_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,
    account VARCHAR(32) NOT NULL,side VARCHAR(6) NOT NULL,amount_cents BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(journal_id) REFERENCES billing_journals(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    INDEX posting_account(tenant_id,account,created_at)
  ) ENGINE=InnoDB`);
}

export async function postJournal(db,{tenant,sourceType,sourceId,debit,credit,amountCents}){
  if(!/^[a-z_]{2,24}$/.test(sourceType)||!['prepaid_liability','accounts_receivable','revenue','carrier_payable'].includes(debit)||
    !['prepaid_liability','accounts_receivable','revenue','carrier_payable'].includes(credit)||debit===credit||
    !Number.isSafeInteger(amountCents)||amountCents<1)throw new RangeError('Invalid journal');
  const id=randomUUID();
  await db.query('INSERT INTO billing_journals(id,tenant_id,source_type,source_id) VALUES($1,$2,$3,$4)',[id,tenant,sourceType,sourceId]);
  for(const [side,account] of [['debit',debit],['credit',credit]])
    await db.query('INSERT INTO billing_postings(id,journal_id,tenant_id,account,side,amount_cents) VALUES($1,$2,$3,$4,$5,$6)',
      [randomUUID(),id,tenant,account,side,amountCents]);
  return id;
}
