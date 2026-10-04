CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_salt VARCHAR(64) NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX sessions_expires_at_idx (expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS contacts (
  owner_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_id, contact_id),
  CONSTRAINT fk_contacts_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_contacts_contact FOREIGN KEY (contact_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_contacts_distinct CHECK (owner_id <> contact_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) PRIMARY KEY,
  sender_id CHAR(36) NOT NULL,
  recipient_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_messages_distinct CHECK (sender_id <> recipient_id),
  CONSTRAINT chk_messages_body CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 4000),
  INDEX messages_thread_idx (sender_id, recipient_id, created_at),
  INDEX messages_inbox_idx (recipient_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS plans (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  monthly_cents INT NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_plans_price CHECK (monthly_cents >= 0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id CHAR(36) PRIMARY KEY,
  plan_id CHAR(36) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_payment',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans(id),
  CONSTRAINT chk_subscription_status CHECK (status IN ('pending_payment','active','cancelled'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS invoices (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  amount_cents INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(16) NOT NULL DEFAULT 'unpaid',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_invoices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_invoices_amount CHECK (amount_cents >= 0),
  CONSTRAINT chk_invoices_status CHECK (status IN ('unpaid','paid','void')),
  INDEX invoices_user_idx (user_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS port_requests (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  number_e164 VARCHAR(16) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_port_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_port_status CHECK (status IN ('draft','reviewing','submitted','completed','rejected')),
  INDEX port_requests_user_idx (user_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS did_quotes (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  number_e164 VARCHAR(16) NOT NULL,
  provider_monthly_cents INT NOT NULL,
  provider_setup_cents INT NOT NULL,
  monthly_cents INT NOT NULL,
  setup_cents INT NOT NULL,
  markup_bps INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'quote',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_did_quotes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_did_quotes_status CHECK (status IN ('quote','pending_payment','expired','fulfilled'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS meeting_rooms (
  id CHAR(36) PRIMARY KEY,
  host_id CHAR(36) NOT NULL,
  title VARCHAR(100) NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  ended_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_meeting_rooms_host FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX meeting_rooms_host_idx (host_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS user_groups (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  features JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS user_group_members (
  user_id CHAR(36) NOT NULL,
  group_id CHAR(36) NOT NULL,
  PRIMARY KEY (user_id, group_id),
  CONSTRAINT fk_user_group_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_group_members_group FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mobile_apps (
  id CHAR(36) PRIMARY KEY,
  platform VARCHAR(16) NOT NULL,
  app_identifier VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  store_app_id VARCHAR(64) NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_mobile_apps_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_mobile_platform CHECK (platform IN ('android','ios')),
  UNIQUE KEY mobile_apps_identifier (platform, app_identifier)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mobile_releases (
  id CHAR(36) PRIMARY KEY,
  app_id CHAR(36) NOT NULL,
  version_name VARCHAR(64) NOT NULL,
  build_number VARCHAR(64) NOT NULL,
  track VARCHAR(32) NOT NULL,
  rollout_percent TINYINT UNSIGNED NOT NULL DEFAULT 100,
  release_notes TEXT NOT NULL,
  artifact_url VARCHAR(2048) NOT NULL,
  artifact_sha256 CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  approved_by CHAR(36) NULL,
  approved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_mobile_releases_app FOREIGN KEY (app_id) REFERENCES mobile_apps(id),
  CONSTRAINT fk_mobile_releases_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_mobile_releases_approver FOREIGN KEY (approved_by) REFERENCES users(id),
  CONSTRAINT chk_mobile_release_status CHECK (status IN ('draft','approved','archived')),
  CONSTRAINT chk_mobile_rollout CHECK (rollout_percent BETWEEN 1 AND 100),
  UNIQUE KEY mobile_releases_build (app_id, build_number),
  INDEX mobile_releases_status (app_id,status,created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS mobile_release_events (
  id CHAR(36) PRIMARY KEY,
  release_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NOT NULL,
  action VARCHAR(24) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_mobile_events_release FOREIGN KEY (release_id) REFERENCES mobile_releases(id),
  CONSTRAINT fk_mobile_events_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX mobile_events_release (release_id,created_at)
) ENGINE=InnoDB;
INSERT IGNORE INTO user_groups (id,name,features)
VALUES ('00000000-0000-4000-8000-000000000001','Standard',
  '{"meetings":true,"screen_share":true,"remote_assist":false,"messaging":true,"billing":true}');
INSERT IGNORE INTO user_group_members(user_id,group_id)
SELECT u.id,'00000000-0000-4000-8000-000000000001' FROM users u
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key='groups_backfilled');
INSERT IGNORE INTO app_settings(setting_key,value) VALUES('groups_backfilled','true');
