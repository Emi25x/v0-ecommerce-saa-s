-- Customer Service / Centro de Mensajes
-- Unified inbox for ML questions, WhatsApp, Instagram DMs, and other channels
-- Run this migration in Supabase SQL editor

-- ─── 1. cs_conversations ──────────────────────────────────────────────────────
-- One row per conversation thread (a customer + a channel + a context)
CREATE TABLE IF NOT EXISTS cs_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Channel: 'ml_question' | 'ml_message' | 'whatsapp' | 'instagram' | 'email'
  channel         text NOT NULL,

  -- External IDs (per channel)
  external_id     text,          -- ML question_id / WA conversation_id / IG thread_id
  ml_account_id   uuid,          -- FK to ml_accounts (for ML channel)

  -- Customer info (denormalized for fast display)
  customer_name   text,
  customer_id     text,          -- external customer identifier (ML seller_id, WA phone, IG user)
  customer_avatar text,          -- URL

  -- Subject / product context
  subject         text,          -- question text or conversation title
  product_id      uuid REFERENCES products(id) ON DELETE SET NULL,
  product_title   text,          -- denormalized

  -- Status: 'open' | 'pending_reply' | 'answered' | 'closed'
  status          text NOT NULL DEFAULT 'open',

  -- Priority: 0=normal, 1=high, 2=urgent
  priority        integer NOT NULL DEFAULT 0,

  -- Counts for display
  unread_count    integer NOT NULL DEFAULT 0,
  message_count   integer NOT NULL DEFAULT 0,

  -- Timestamps
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (channel, external_id, user_id)
);

CREATE INDEX IF NOT EXISTS cs_conversations_user_id_idx       ON cs_conversations(user_id);
CREATE INDEX IF NOT EXISTS cs_conversations_status_idx        ON cs_conversations(user_id, status);
CREATE INDEX IF NOT EXISTS cs_conversations_channel_idx       ON cs_conversations(user_id, channel);
CREATE INDEX IF NOT EXISTS cs_conversations_last_message_idx  ON cs_conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS cs_conversations_ml_account_idx    ON cs_conversations(ml_account_id);

-- ─── 2. cs_messages ───────────────────────────────────────────────────────────
-- Individual messages within a conversation
CREATE TABLE IF NOT EXISTS cs_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES cs_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Direction: 'inbound' (from customer) | 'outbound' (from us)
  direction       text NOT NULL,

  -- Author info
  author_name     text,
  author_type     text NOT NULL DEFAULT 'customer', -- 'customer' | 'agent' | 'system' | 'bot'

  -- Content
  content         text NOT NULL,
  content_type    text NOT NULL DEFAULT 'text',    -- 'text' | 'image' | 'file' | 'template'

  -- Attachments (array of {url, type, name})
  attachments     jsonb DEFAULT '[]'::jsonb,

  -- External ID (for deduplication)
  external_id     text,

  -- Read tracking
  is_read         boolean NOT NULL DEFAULT false,
  read_at         timestamptz,

  -- Template used for this response (optional)
  template_id     uuid,

  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (conversation_id, external_id)
);

CREATE INDEX IF NOT EXISTS cs_messages_conversation_idx  ON cs_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS cs_messages_user_id_idx       ON cs_messages(user_id);
CREATE INDEX IF NOT EXISTS cs_messages_unread_idx        ON cs_messages(conversation_id, is_read) WHERE is_read = false;

-- ─── 3. cs_response_templates ─────────────────────────────────────────────────
-- Quick-reply templates with variable substitution ({{customer_name}}, {{product_title}}, etc.)
CREATE TABLE IF NOT EXISTS cs_response_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name        text NOT NULL,       -- internal name for search
  category    text,                -- 'shipping', 'returns', 'stock', 'payment', 'general'
  channels    text[] DEFAULT '{}', -- applicable channels (empty = all)

  subject     text,                -- for email channel
  body        text NOT NULL,       -- template body with {{variables}}

  -- Usage stats
  use_count   integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,

  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cs_templates_user_id_idx  ON cs_response_templates(user_id);
CREATE INDEX IF NOT EXISTS cs_templates_category_idx ON cs_response_templates(user_id, category);

-- ─── 4. cs_auto_reply_rules ───────────────────────────────────────────────────
-- Auto-reply rules: match keywords → reply with template (or escalate)
CREATE TABLE IF NOT EXISTS cs_auto_reply_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name         text NOT NULL,
  channels     text[] DEFAULT '{}',           -- empty = all channels
  is_active    boolean NOT NULL DEFAULT true,
  priority     integer NOT NULL DEFAULT 0,    -- higher = evaluated first

  -- Match criteria (all specified conditions must match)
  keywords     text[] DEFAULT '{}',           -- any keyword triggers
  match_mode   text NOT NULL DEFAULT 'any',   -- 'any' | 'all'
  status_filter text,                         -- only match conversations in this status

  -- Action
  action       text NOT NULL DEFAULT 'reply', -- 'reply' | 'tag' | 'assign' | 'escalate'
  template_id  uuid REFERENCES cs_response_templates(id) ON DELETE SET NULL,
  tag          text,                          -- tag to apply
  delay_seconds integer NOT NULL DEFAULT 0,  -- delay before sending auto-reply

  -- Stats
  trigger_count integer NOT NULL DEFAULT 0,
  last_triggered_at timestamptz,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cs_auto_rules_user_id_idx ON cs_auto_reply_rules(user_id, is_active);

-- ─── 5. cs_channel_configs ────────────────────────────────────────────────────
-- Per-channel connection configuration (WhatsApp phone IDs, Instagram tokens, etc.)
CREATE TABLE IF NOT EXISTS cs_channel_configs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  channel     text NOT NULL,          -- 'whatsapp' | 'instagram' | 'email'
  name        text NOT NULL,          -- display name (e.g. "WhatsApp Principal")
  is_active   boolean NOT NULL DEFAULT false,

  -- Encrypted config (phone_number_id, access_token, webhook_verify_token, etc.)
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, channel, name)
);

CREATE INDEX IF NOT EXISTS cs_channel_configs_user_idx ON cs_channel_configs(user_id, channel);

-- ─── RLS Policies ─────────────────────────────────────────────────────────────
ALTER TABLE cs_conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_response_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_auto_reply_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_channel_configs       ENABLE ROW LEVEL SECURITY;

-- conversations
CREATE POLICY "Users manage own conversations"
  ON cs_conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- messages
CREATE POLICY "Users manage own messages"
  ON cs_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- templates
CREATE POLICY "Users manage own templates"
  ON cs_response_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- auto reply rules
CREATE POLICY "Users manage own auto reply rules"
  ON cs_auto_reply_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- channel configs
CREATE POLICY "Users manage own channel configs"
  ON cs_channel_configs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER cs_conversations_updated_at
  BEFORE UPDATE ON cs_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER cs_response_templates_updated_at
  BEFORE UPDATE ON cs_response_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER cs_auto_reply_rules_updated_at
  BEFORE UPDATE ON cs_auto_reply_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER cs_channel_configs_updated_at
  BEFORE UPDATE ON cs_channel_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
