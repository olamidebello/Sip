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
