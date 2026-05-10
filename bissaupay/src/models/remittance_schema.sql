-- ============================================================
-- BISSAUPAY — Schema: Remessas Internacionais
-- ============================================================

DO $$ BEGIN
  CREATE TYPE remittance_direction AS ENUM ('outbound', 'inbound');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE remittance_status AS ENUM (
    'draft', 'pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_method AS ENUM (
    'bank_transfer', 'mobile_wallet', 'cash_pickup', 'home_delivery'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- TABELA: remittance_corridors
-- ============================================================
CREATE TABLE IF NOT EXISTS remittance_corridors (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                VARCHAR(20) UNIQUE NOT NULL,
  origin_country      CHAR(2) NOT NULL,
  dest_country        CHAR(2) NOT NULL,
  origin_currency     CHAR(3) NOT NULL,
  dest_currency       CHAR(3) NOT NULL,
  direction           remittance_direction NOT NULL,
  fee_rate            NUMERIC(6,4) DEFAULT 0.0200,
  fee_fixed           BIGINT DEFAULT 0,
  fee_min             BIGINT DEFAULT 0,
  min_amount          BIGINT DEFAULT 100000,
  max_amount          BIGINT DEFAULT 2000000000,
  kyc_threshold       BIGINT DEFAULT 50000000,
  delivery_methods    JSONB DEFAULT '["bank_transfer"]',
  preferred_provider  VARCHAR(30),
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: exchange_rates
-- ============================================================
CREATE TABLE IF NOT EXISTS exchange_rates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_currency   CHAR(3) NOT NULL,
  quote_currency  CHAR(3) NOT NULL,
  rate            NUMERIC(18,8) NOT NULL,
  source          VARCHAR(30) DEFAULT 'exchangerate-api',
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (base_currency, quote_currency)
);

CREATE INDEX IF NOT EXISTS idx_rates_pair ON exchange_rates(base_currency, quote_currency);

-- ============================================================
-- TABELA: remittance_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS remittance_orders (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference           VARCHAR(30) UNIQUE NOT NULL,
  corridor_id         UUID NOT NULL REFERENCES remittance_corridors(id),
  sender_id           UUID NOT NULL REFERENCES users(id),
  transaction_id      UUID REFERENCES transactions(id),
  direction           remittance_direction NOT NULL,
  status              remittance_status DEFAULT 'draft',
  delivery_method     delivery_method NOT NULL,
  send_amount         BIGINT NOT NULL CHECK (send_amount > 0),
  send_currency       CHAR(3) NOT NULL,
  fee_amount          BIGINT NOT NULL DEFAULT 0,
  exchange_rate       NUMERIC(18,8) NOT NULL,
  rate_locked_at      TIMESTAMPTZ,
  rate_expires_at     TIMESTAMPTZ,
  receive_amount      BIGINT NOT NULL CHECK (receive_amount > 0),
  receive_currency    CHAR(3) NOT NULL,
  recipient_name      VARCHAR(150) NOT NULL,
  recipient_phone     VARCHAR(30),
  recipient_email     VARCHAR(150),
  recipient_country   CHAR(2) NOT NULL,
  delivery_details    JSONB NOT NULL DEFAULT '{}',
  provider_name       VARCHAR(30),
  provider_ref        VARCHAR(100),
  provider_response   JSONB DEFAULT '{}',
  provider_fee        BIGINT DEFAULT 0,
  refund_transaction_id UUID REFERENCES transactions(id),
  refunded_at         TIMESTAMPTZ,
  purpose             VARCHAR(100),
  source_of_funds     VARCHAR(100),
  compliance_notes    TEXT,
  ip_address          INET,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  failed_reason       TEXT,
  cancelled_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_remittance_sender ON remittance_orders(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remittance_status ON remittance_orders(status);
CREATE INDEX IF NOT EXISTS idx_remittance_ref    ON remittance_orders(reference);

-- ============================================================
-- DADOS INICIAIS: Corredores
-- ============================================================

INSERT INTO remittance_corridors
  (code, origin_country, dest_country, origin_currency, dest_currency,
   direction, fee_rate, fee_fixed, min_amount, max_amount,
   kyc_threshold, delivery_methods, preferred_provider)
VALUES
  ('GB_PT', 'GW', 'PT', 'XOF', 'EUR', 'outbound', 0.0200, 0, 100000, 2000000000,
   50000000, '["bank_transfer","mobile_wallet"]', 'wise'),

  ('GB_SN', 'GW', 'SN', 'XOF', 'XOF', 'outbound', 0.0100, 0, 100000, 1000000000,
   100000000, '["mobile_wallet","cash_pickup"]', 'wave'),

  ('GB_BR', 'GW', 'BR', 'XOF', 'BRL', 'outbound', 0.0220, 0, 100000, 2000000000,
   50000000, '["bank_transfer"]', 'wise'),

  ('GB_FR', 'GW', 'FR', 'XOF', 'EUR', 'outbound', 0.0200, 0, 100000, 2000000000,
   50000000, '["bank_transfer"]', 'wise'),

  ('PT_GB', 'PT', 'GW', 'EUR', 'XOF', 'inbound', 0.0150, 0, 500, 500000,
   50000, '["mobile_wallet"]', 'wise'),

  ('SN_GB', 'SN', 'GW', 'XOF', 'XOF', 'inbound', 0.0100, 0, 100000, 1000000000,
   100000000, '["mobile_wallet","cash_pickup"]', 'wave')

ON CONFLICT (code) DO NOTHING;
