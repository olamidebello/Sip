CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS contacts (
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, contact_id),
  CHECK (owner_id <> contact_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS messages_inbox_idx ON messages(recipient_id, created_at);
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  monthly_cents integer NOT NULL CHECK (monthly_cents >= 0),
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL DEFAULT 'pending_payment',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending_payment','active','cancelled'))
);
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('unpaid','paid','void'))
);
CREATE INDEX IF NOT EXISTS invoices_user_idx ON invoices(user_id, created_at);
CREATE TABLE IF NOT EXISTS port_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number_e164 text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft','reviewing','submitted','completed','rejected'))
);
CREATE TABLE IF NOT EXISTS did_quotes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  number_e164 text NOT NULL,
  provider_monthly_cents integer NOT NULL,
  provider_setup_cents integer NOT NULL,
  monthly_cents integer NOT NULL,
  setup_cents integer NOT NULL,
  markup_bps integer NOT NULL,
  status text NOT NULL DEFAULT 'quote',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('quote','pending_payment','expired','fulfilled'))
);
CREATE TABLE IF NOT EXISTS meeting_rooms (
  id uuid PRIMARY KEY,
  host_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_rooms_host_idx ON meeting_rooms(host_id, created_at);
CREATE TABLE IF NOT EXISTS user_groups (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_group_members (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);
INSERT INTO user_groups (id,name,features)
VALUES ('00000000-0000-4000-8000-000000000001','Standard',
  '{"meetings":true,"screen_share":true,"remote_assist":false,"messaging":true,"billing":true}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO user_group_members(user_id,group_id)
SELECT u.id,'00000000-0000-4000-8000-000000000001'::uuid FROM users u
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key='groups_backfilled')
ON CONFLICT DO NOTHING;
INSERT INTO app_settings(key,value) VALUES('groups_backfilled','true') ON CONFLICT DO NOTHING;
