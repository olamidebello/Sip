CREATE TABLE IF NOT EXISTS did_requested_blocks (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  prefix_digits CHAR(6) NOT NULL,
  requested_count INT UNSIGNED NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'needs_format_review',
  note VARCHAR(255) NOT NULL,
  CONSTRAINT fk_did_requested_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE KEY did_requested_tenant_prefix (tenant_id,prefix_digits)
) ENGINE=InnoDB;
INSERT IGNORE INTO did_requested_blocks(id,tenant_id,prefix_digits,requested_count,status,note) VALUES
('00000000-0000-4000-8000-000000203150','00000000-0000-4000-8000-000000000000','203150',10000,'allocated_ncc','Nigeria +234 Ilorin, allocated to Smooth Multi-Service Platform Limited per NCC'),
('00000000-0000-4000-8000-000000203151','00000000-0000-4000-8000-000000000000','203151',10000,'allocated_ncc','Nigeria +234 Ilorin, allocated to Smooth Multi-Service Platform Limited per NCC'),
('00000000-0000-4000-8000-000000203152','00000000-0000-4000-8000-000000000000','203152',10000,'allocated_ncc','Nigeria +234 Ilorin, allocated to Smooth Multi-Service Platform Limited per NCC'),
('00000000-0000-4000-8000-000000203153','00000000-0000-4000-8000-000000000000','203153',10000,'allocated_ncc','Nigeria +234 Ilorin, allocated to Smooth Multi-Service Platform Limited per NCC'),
('00000000-0000-4000-8000-000000203154','00000000-0000-4000-8000-000000000000','203154',10000,'allocated_ncc','Nigeria +234 Ilorin, allocated to Smooth Multi-Service Platform Limited per NCC');
UPDATE did_requested_blocks SET status='allocated_ncc',note='Nigeria +234 Ilorin, allocated to Smooth Multi-Service Platform Limited per NCC'
WHERE tenant_id='00000000-0000-4000-8000-000000000000'
  AND prefix_digits IN ('203150','203151','203152','203153','203154')
  AND status='needs_format_review';
CREATE TABLE IF NOT EXISTS inhouse_dids (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  number_e164 VARCHAR(16) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'unverified',
  setup_cents INT UNSIGNED NOT NULL,
  monthly_cents INT UNSIGNED NOT NULL,
  evidence_reference VARCHAR(255) NOT NULL,
  user_id CHAR(36) NULL,
  invoice_id CHAR(36) NULL,
  reserved_until DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_inhouse_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_inhouse_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_inhouse_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT chk_inhouse_status CHECK (status IN ('unverified','available','reserved','assigned','disabled')),
  UNIQUE KEY inhouse_number (number_e164),
  INDEX inhouse_tenant_status (tenant_id,status,number_e164),
  INDEX inhouse_user (tenant_id,user_id)
) ENGINE=InnoDB;
