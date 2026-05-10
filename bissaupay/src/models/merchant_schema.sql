-- ============================================================
-- BISSAUPAY — Schema: Módulo de Comerciantes
-- ============================================================

DO $$ BEGIN
  CREATE TYPE qr_type AS ENUM ('static', 'dynamic');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_request_status AS ENUM ('pending', 'paid', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- TABELA: payment_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  short_code      VARCHAR(16) UNIQUE NOT NULL,
  qr_type         qr_type NOT NULL DEFAULT 'dynamic',
  status          payment_request_status DEFAULT 'pending',
  amount          BIGINT CHECK (amount IS NULL OR amount > 0),
  description     VARCHAR(200),
  merchant_ref    VARCHAR(100),
  qr_image        TEXT,
  qr_payload      TEXT NOT NULL,
  transaction_id  UUID REFERENCES transactions(id),
  expires_at      TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_merchant ON payment_requests(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_short    ON payment_requests(short_code);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status   ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_expires  ON payment_requests(expires_at) WHERE status = 'pending';

-- ============================================================
-- TABELA: merchant_settlements
-- ============================================================
CREATE TABLE IF NOT EXISTS merchant_settlements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  amount          BIGINT NOT NULL CHECK (amount > 0),
  fee             BIGINT NOT NULL DEFAULT 0,
  net_amount      BIGINT GENERATED ALWAYS AS (amount - fee) STORED,
  period_from     DATE NOT NULL,
  period_to       DATE NOT NULL,
  tx_count        INT NOT NULL DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'pending',
  reference       VARCHAR(30),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- ============================================================
-- VIEWS: comerciante
-- ============================================================

CREATE OR REPLACE VIEW v_merchant_sales AS
SELECT
  m.id AS merchant_id,
  m.business_name,
  m.fee_rate,
  COUNT(t.id)                       AS total_transactions,
  COALESCE(SUM(t.amount), 0)        AS total_gross,
  COALESCE(SUM(t.fee), 0)           AS total_fees,
  COALESCE(SUM(t.net_amount), 0)    AS total_net,
  COALESCE(SUM(CASE WHEN DATE(t.created_at) = CURRENT_DATE THEN t.amount ELSE 0 END), 0) AS today_gross,
  COALESCE(SUM(CASE WHEN t.created_at >= DATE_TRUNC('month', NOW()) THEN t.amount ELSE 0 END), 0) AS month_gross
FROM merchants m
LEFT JOIN transactions t
  ON t.receiver_id = m.user_id
  AND t.type = 'payment'
  AND t.status = 'completed'
GROUP BY m.id, m.business_name, m.fee_rate;

CREATE OR REPLACE VIEW v_merchant_recent_transactions AS
SELECT
  t.id,
  t.reference,
  t.amount,
  t.fee,
  t.net_amount,
  t.description,
  t.created_at,
  t.completed_at,
  t.status,
  m.id AS merchant_id,
  u.full_name  AS customer_name,
  u.phone      AS customer_phone,
  pr.short_code,
  pr.merchant_ref,
  pr.qr_type
FROM transactions t
JOIN users u     ON u.id = t.sender_id
JOIN merchants m ON m.user_id = t.receiver_id
LEFT JOIN payment_requests pr ON pr.transaction_id = t.id
WHERE t.type = 'payment'
  AND t.created_at >= NOW() - INTERVAL '30 days';
