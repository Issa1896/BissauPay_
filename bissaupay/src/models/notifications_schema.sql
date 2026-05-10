-- ============================================================
-- BISSAUPAY — Schema: Notificações In-App
-- ============================================================

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'credit', 'debit', 'info', 'success', 'warning', 'error'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL DEFAULT 'info',
  title       VARCHAR(100) NOT NULL,
  body        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(user_id, is_read) WHERE is_read = FALSE;
