CREATE TABLE IF NOT EXISTS pbx_destinations (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  number VARCHAR(10) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  name VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pbx_dest_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT chk_pbx_dest_kind CHECK (kind IN ('extension','queue')),
  UNIQUE KEY pbx_dest_tenant_number (tenant_id,number)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pbx_extensions (
  destination_id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  voicemail_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  forward_to VARCHAR(20) NULL,
  CONSTRAINT fk_pbx_ext_dest FOREIGN KEY (destination_id) REFERENCES pbx_destinations(id),
  CONSTRAINT fk_pbx_ext_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_pbx_ext_user FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY pbx_ext_user (tenant_id,user_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pbx_queues (
  destination_id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  strategy VARCHAR(24) NOT NULL,
  max_wait_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 120,
  CONSTRAINT fk_pbx_queue_dest FOREIGN KEY (destination_id) REFERENCES pbx_destinations(id),
  CONSTRAINT fk_pbx_queue_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT chk_pbx_queue_strategy CHECK (strategy IN ('ring_all','ordered','longest_idle'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pbx_queue_members (
  queue_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY(queue_id,user_id),
  CONSTRAINT fk_pbx_member_queue FOREIGN KEY (queue_id) REFERENCES pbx_queues(destination_id),
  CONSTRAINT fk_pbx_member_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pbx_agent_status (
  user_id CHAR(36) PRIMARY KEY,
  status VARCHAR(16) NOT NULL DEFAULT 'offline',
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pbx_agent_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT chk_pbx_agent_status CHECK (status IN ('ready','away','offline'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pbx_inbound_routes (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  did_e164 VARCHAR(16) NOT NULL,
  destination_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pbx_route_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_pbx_route_dest FOREIGN KEY (destination_id) REFERENCES pbx_destinations(id),
  UNIQUE KEY pbx_route_did (tenant_id,did_e164)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pbx_trunks (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port SMALLINT UNSIGNED NOT NULL DEFAULT 5060,
  transport VARCHAR(8) NOT NULL DEFAULT 'tls',
  priority SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_pbx_trunk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT chk_pbx_trunk_transport CHECK (transport IN ('udp','tcp','tls')),
  UNIQUE KEY pbx_trunk_name (tenant_id,name)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pbx_rates (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  trunk_id CHAR(36) NOT NULL,
  prefix VARCHAR(15) NOT NULL,
  cost_cents_per_minute INT UNSIGNED NOT NULL,
  price_cents_per_minute INT UNSIGNED NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_pbx_rate_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_pbx_rate_trunk FOREIGN KEY (trunk_id) REFERENCES pbx_trunks(id),
  UNIQUE KEY pbx_rate_prefix_trunk (tenant_id,prefix,trunk_id),
  INDEX pbx_rate_tenant_prefix (tenant_id,prefix)
) ENGINE=InnoDB;
