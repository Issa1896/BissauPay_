-- ============================================================
-- BISSAUPAY — Schema Principal
-- PostgreSQL 14+
-- Moeda base: XOF (Franco CFA)
-- Todos os valores monetários em CENTAVOS (inteiro BIGINT)
-- para evitar erros de ponto flutuante
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended', 'blocked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE user_level AS ENUM ('basic', 'verified', 'merchant', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM (
    'transfer',
    'deposit',
    'withdrawal',
    'payment',
    'topup',
    'remittance_in',
    'remittance_out',
    'fee',
    'reversal'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'reversed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- TABELA: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone               VARCHAR(20) UNIQUE NOT NULL,
  email               VARCHAR(255) UNIQUE,
  full_name           VARCHAR(120) NOT NULL,
  pin_hash            VARCHAR(255) NOT NULL,
  status              user_status DEFAULT 'pending',
  level               user_level DEFAULT 'basic',

  -- KYC
  document_type       VARCHAR(30),
  document_number     VARCHAR(50),
  document_photo      VARCHAR(255),
  selfie_photo        VARCHAR(255),
  kyc_status          VARCHAR(20) DEFAULT 'none', -- none, pending, approved, rejected
  kyc_verified_at     TIMESTAMPTZ,
  kyc_rejected_reason TEXT,

  -- Segurança
  failed_pin_attempts INT DEFAULT 0,
  locked_until        TIMESTAMPTZ,

  -- Preferências
  language            VARCHAR(5) DEFAULT 'pt',  -- 'pt' ou 'kri'
  push_token          VARCHAR(255),             -- token para notificações push

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone  ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_level  ON users(level);

-- ============================================================
-- TABELA: wallets
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  balance         BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),

  daily_limit     BIGINT NOT NULL DEFAULT 50000000,
  daily_spent     BIGINT NOT NULL DEFAULT 0,
  daily_reset_at  DATE DEFAULT CURRENT_DATE,

  is_frozen       BOOLEAN DEFAULT FALSE,
  frozen_reason   TEXT,
  frozen_at       TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- ============================================================
-- TABELA: transactions
-- IMUTÁVEL — nunca atualizar registros, só criar novos
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference       VARCHAR(30) UNIQUE NOT NULL,

  type            transaction_type NOT NULL,
  status          transaction_status DEFAULT 'pending',

  sender_id       UUID REFERENCES users(id),
  receiver_id     UUID REFERENCES users(id),

  amount          BIGINT NOT NULL CHECK (amount > 0),
  fee             BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0),
  net_amount      BIGINT GENERATED ALWAYS AS (amount - fee) STORED,

  currency_from   CHAR(3) DEFAULT 'XOF',
  currency_to     CHAR(3) DEFAULT 'XOF',
  exchange_rate   NUMERIC(12,6) DEFAULT 1.0,

  description     TEXT,
  metadata        JSONB DEFAULT '{}',

  ip_address      INET,
  device_id       VARCHAR(255),

  reversed_by     UUID REFERENCES transactions(id),

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failed_reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_sender    ON transactions(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver  ON transactions(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_transactions_status    ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created   ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type      ON transactions(type, created_at DESC);

-- ============================================================
-- TABELA: otp_codes
-- ============================================================
CREATE TABLE IF NOT EXISTS otp_codes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       VARCHAR(20) NOT NULL,
  code        VARCHAR(6) NOT NULL,
  purpose     VARCHAR(30) NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  attempts    INT DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone   ON otp_codes(phone, purpose, used);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);

-- ============================================================
-- TABELA: sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) UNIQUE NOT NULL,
  device_id   VARCHAR(255),
  device_name VARCHAR(100),
  ip_address  INET,
  user_agent  TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_seen   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

-- ============================================================
-- TABELA: merchants
-- ============================================================
CREATE TABLE IF NOT EXISTS merchants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id),
  business_name   VARCHAR(150) NOT NULL,
  business_type   VARCHAR(60),
  qr_code_static  VARCHAR(255),
  fee_rate        NUMERIC(5,4) DEFAULT 0.0100,
  total_received  BIGINT DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: audit_log (imutável)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40),
  entity_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at DESC);

-- ============================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Reset automático do limite diário
CREATE OR REPLACE FUNCTION reset_daily_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.daily_reset_at < CURRENT_DATE THEN
    NEW.daily_spent    = 0;
    NEW.daily_reset_at = CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_daily_reset ON wallets;
CREATE TRIGGER trg_wallet_daily_reset
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION reset_daily_limit();

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_user_statement AS
SELECT
  t.id,
  t.reference,
  t.type,
  t.status,
  u.id AS user_id,
  CASE WHEN t.receiver_id = u.id THEN 'credit' ELSE 'debit' END AS direction,
  CASE WHEN t.receiver_id = u.id THEN t.net_amount ELSE -(t.amount) END AS amount_signed,
  t.amount,
  t.fee,
  t.description,
  t.created_at,
  t.completed_at,
  sender.full_name   AS sender_name,
  sender.phone       AS sender_phone,
  receiver.full_name AS receiver_name,
  receiver.phone     AS receiver_phone
FROM transactions t
JOIN users u ON (u.id = t.sender_id OR u.id = t.receiver_id)
LEFT JOIN users sender   ON sender.id   = t.sender_id
LEFT JOIN users receiver ON receiver.id = t.receiver_id
WHERE t.status = 'completed';
