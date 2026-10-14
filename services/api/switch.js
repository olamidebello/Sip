// Historical schema retained to preserve existing tenant records.
export async function migrateSwitch(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS switch_tenants (
    tenant_id CHAR(36) PRIMARY KEY, domain VARCHAR(255) NOT NULL UNIQUE,
    tariff_id CHAR(36) NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(tariff_id) REFERENCES operator_tariffs(id),
    FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS switch_gateways (
    tenant_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,gateway_name VARCHAR(64) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY(tenant_id,provider),UNIQUE KEY gateway_owner(gateway_name),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
}
