CREATE TABLE IF NOT EXISTS nigeria_interconnect_peers (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  peer_type VARCHAR(16) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port SMALLINT UNSIGNED NOT NULL,
  transport VARCHAR(8) NOT NULL,
  destination_prefix VARCHAR(15) NOT NULL,
  agreement_reference VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'planned',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_nigeria_peer_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT chk_nigeria_peer_type CHECK (peer_type IN ('clearinghouse','operator')),
  CONSTRAINT chk_nigeria_peer_transport CHECK (transport IN ('tls','tcp','udp')),
  CONSTRAINT chk_nigeria_peer_status CHECK (status IN ('planned','disabled')),
  UNIQUE KEY nigeria_peer_name (tenant_id,name)
) ENGINE=InnoDB;
