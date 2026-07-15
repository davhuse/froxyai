-- Froxy AI Gateway PostgreSQL schema reference.
-- Runtime SQLite-compatible tables are created automatically from server.js,
-- but production Postgres should use JSONB for pricing and architecture.

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  context_length INTEGER NOT NULL DEFAULT 8192,
  pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
  architecture JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider TEXT,
  data_regions TEXT[] NOT NULL DEFAULT ARRAY['US'],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT models_pricing_keys CHECK (
    pricing ? 'prompt' AND
    pricing ? 'completion' AND
    pricing ? 'request' AND
    pricing ? 'image' AND
    pricing ? 'web_search' AND
    pricing ? 'internal_reasoning' AND
    pricing ? 'input_cache_read' AND
    pricing ? 'input_cache_write'
  ),
  CONSTRAINT models_architecture_keys CHECK (
    architecture ? 'input_modalities' AND
    architecture ? 'modality' AND
    architecture ? 'instruct_type'
  )
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  balance_usd NUMERIC(18, 12) NOT NULL DEFAULT 0,
  rate_limit_per_second INTEGER,
  data_region TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes JSONB NOT NULL DEFAULT '["chat","models","embeddings"]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_provider_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id),
  api_key_id TEXT REFERENCES workspace_api_keys(id),
  user_id INTEGER,
  endpoint TEXT NOT NULL,
  model_id TEXT REFERENCES models(id),
  provider TEXT,
  latency_ms INTEGER,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  image_units INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(18, 12) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_models_active ON models(is_active);
CREATE INDEX IF NOT EXISTS idx_usage_workspace_created ON usage_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_keys_hash ON workspace_api_keys(key_hash);
