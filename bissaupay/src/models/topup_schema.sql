-- ============================================================
-- BISSAUPAY — Schema: Módulo de Recargas e Utilitários
-- ============================================================

DO $$ BEGIN
  CREATE TYPE topup_category AS ENUM ('mobile_credit', 'mobile_data', 'electricity', 'water');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE topup_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- TABELA: topup_providers
-- ============================================================
CREATE TABLE IF NOT EXISTS topup_providers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(30) UNIQUE NOT NULL,
  name            VARCHAR(100) NOT NULL,
  category        topup_category NOT NULL,
  min_amount      BIGINT,
  max_amount      BIGINT,
  preset_amounts  JSONB DEFAULT '[]',
  fee_rate        NUMERIC(5,4) DEFAULT 0.0000,
  recipient_label VARCHAR(50) DEFAULT 'Número de telefone',
  recipient_type  VARCHAR(20) DEFAULT 'phone',
  recipient_regex VARCHAR(100),
  is_active       BOOLEAN DEFAULT TRUE,
  logo_url        VARCHAR(255),
  api_config      JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: topup_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS topup_orders (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference           VARCHAR(30) UNIQUE NOT NULL,
  user_id             UUID NOT NULL REFERENCES users(id),
  provider_id         UUID NOT NULL REFERENCES topup_providers(id),
  transaction_id      UUID REFERENCES transactions(id),
  category            topup_category NOT NULL,
  status              topup_status DEFAULT 'pending',
  amount              BIGINT NOT NULL CHECK (amount > 0),
  fee                 BIGINT NOT NULL DEFAULT 0,
  recipient           VARCHAR(100) NOT NULL,
  recipient_label     VARCHAR(80),
  provider_ref        VARCHAR(100),
  provider_response   JSONB DEFAULT '{}',
  refund_transaction_id UUID REFERENCES transactions(id),
  refunded_at         TIMESTAMPTZ,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  failed_reason       TEXT
);

CREATE INDEX IF NOT EXISTS idx_topup_orders_user    ON topup_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topup_orders_status  ON topup_orders(status);
CREATE INDEX IF NOT EXISTS idx_topup_orders_ref     ON topup_orders(reference);
CREATE INDEX IF NOT EXISTS idx_topup_orders_pending ON topup_orders(status, created_at) WHERE status IN ('pending','processing');

-- ============================================================
-- DADOS INICIAIS: Provedores da Guiné-Bissau
-- ============================================================

INSERT INTO topup_providers
  (code, name, category, min_amount, max_amount, preset_amounts, fee_rate,
   recipient_label, recipient_type, recipient_regex, logo_url)
VALUES
  ('mtn_gb_credit', 'MTN — Crédito de Voz', 'mobile_credit',
   50000, 5000000, '[50000,100000,200000,500000,1000000,2000000]', 0.0000,
   'Número MTN (+245 9XX)', 'phone', '^(\+245)?9[0-9]{8}$', '/logos/mtn.png'),

  ('mtn_gb_data', 'MTN — Pacote de Dados', 'mobile_data',
   100000, 2000000, '[100000,200000,500000,1000000,2000000]', 0.0000,
   'Número MTN (+245 9XX)', 'phone', '^(\+245)?9[0-9]{8}$', '/logos/mtn.png'),

  ('orange_gb_credit', 'Orange — Crédito de Voz', 'mobile_credit',
   50000, 5000000, '[50000,100000,200000,500000,1000000,2000000]', 0.0000,
   'Número Orange (+245 9XX)', 'phone', '^(\+245)?9[0-9]{8}$', '/logos/orange.png'),

  ('orange_gb_data', 'Orange — Pacote de Dados', 'mobile_data',
   100000, 2000000, '[100000,200000,500000,1000000,2000000]', 0.0000,
   'Número Orange (+245 9XX)', 'phone', '^(\+245)?9[0-9]{8}$', '/logos/orange.png'),

  ('eagb_electricity', 'EAGB — Energia Elétrica', 'electricity',
   500000, 50000000, '[500000,1000000,2000000,5000000,10000000]', 0.0100,
   'Número do contador', 'meter', '^[0-9]{8,12}$', '/logos/eagb.png'),

  ('saab_water', 'SAAB — Água', 'water',
   200000, 20000000, '[200000,500000,1000000,2000000,5000000]', 0.0100,
   'Número da conta de água', 'account', '^[0-9]{6,10}$', '/logos/saab.png')

ON CONFLICT (code) DO NOTHING;
