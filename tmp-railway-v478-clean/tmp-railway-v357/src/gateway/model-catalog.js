const crypto = require('crypto');

const PRICING_KEYS = [
  'prompt',
  'completion',
  'request',
  'image',
  'web_search',
  'internal_reasoning',
  'input_cache_read',
  'input_cache_write'
];

const DEFAULT_PRICING = Object.freeze(Object.fromEntries(PRICING_KEYS.map((key) => [key, '0'])));
const DEFAULT_ARCHITECTURE = Object.freeze({
  input_modalities: ['text'],
  modality: 'text->text',
  instruct_type: 'chatml'
});

const DEFAULT_MODELS = [
  {
    id: 'openai/gpt-5.5',
    name: 'GPT-5.5',
    context_length: 128000,
    provider: 'openai',
    pricing: { prompt: '0.00003', completion: '0.00006', request: '0', image: '0.0008', web_search: '0.01', internal_reasoning: '0.00003', input_cache_read: '0.000003', input_cache_write: '0.00003' },
    architecture: { input_modalities: ['text', 'image'], modality: 'text->text', instruct_type: 'chatml' },
    data_regions: ['US', 'EU']
  },
  {
    id: 'anthropic/claude-opus-4.7',
    name: 'Claude Opus 4.7',
    context_length: 200000,
    provider: 'anthropic',
    pricing: { prompt: '0.000015', completion: '0.000075', request: '0', image: '0.0008', web_search: '0', internal_reasoning: '0.000015', input_cache_read: '0.0000015', input_cache_write: '0.00001875' },
    architecture: { input_modalities: ['text', 'image'], modality: 'text->text', instruct_type: 'chatml' },
    data_regions: ['US']
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    context_length: 1048576,
    provider: 'google',
    pricing: { prompt: '0.00000125', completion: '0.00001', request: '0', image: '0.00025', web_search: '0.005', internal_reasoning: '0.00000125', input_cache_read: '0.000000125', input_cache_write: '0.00000125' },
    architecture: { input_modalities: ['text', 'image'], modality: 'text->text', instruct_type: 'chatml' },
    data_regions: ['US', 'EU']
  },
  {
    id: 'groq/llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    context_length: 131072,
    provider: 'groq',
    pricing: { prompt: '0.00000005', completion: '0.00000008', request: '0', image: '0', web_search: '0', internal_reasoning: '0', input_cache_read: '0', input_cache_write: '0' },
    architecture: { input_modalities: ['text'], modality: 'text->text', instruct_type: 'chatml' },
    data_regions: ['US']
  },
  {
    id: 'openai/text-embedding-3-large',
    name: 'Text Embedding 3 Large',
    context_length: 8191,
    provider: 'openai',
    pricing: { prompt: '0.00000013', completion: '0', request: '0', image: '0', web_search: '0', internal_reasoning: '0', input_cache_read: '0', input_cache_write: '0' },
    architecture: { input_modalities: ['text'], modality: 'text->embedding', instruct_type: 'chatml' },
    data_regions: ['US', 'EU']
  }
];

function safeJsonParse(value, fallback) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function normalizePricing(pricing) {
  const raw = safeJsonParse(pricing, {});
  return Object.fromEntries(PRICING_KEYS.map((key) => [key, String(raw[key] ?? DEFAULT_PRICING[key])]));
}

function normalizeArchitecture(architecture) {
  const raw = safeJsonParse(architecture, {});
  const inputModalities = Array.isArray(raw.input_modalities) ? raw.input_modalities.map(String) : DEFAULT_ARCHITECTURE.input_modalities;
  return {
    input_modalities: inputModalities,
    modality: String(raw.modality || DEFAULT_ARCHITECTURE.modality),
    instruct_type: String(raw.instruct_type || DEFAULT_ARCHITECTURE.instruct_type)
  };
}

function normalizeModelRow(row) {
  return {
    id: row.id,
    name: row.name,
    architecture: normalizeArchitecture(row.architecture),
    pricing: normalizePricing(row.pricing),
    context_length: Number(row.context_length || 0)
  };
}

function jsonString(value) {
  return JSON.stringify(value || {});
}

function initGatewaySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      context_length INTEGER NOT NULL DEFAULT 8192,
      pricing TEXT NOT NULL DEFAULT '{}',
      architecture TEXT NOT NULL DEFAULT '{}',
      provider TEXT,
      data_regions TEXT DEFAULT '["US"]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(owner_user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      balance_usd TEXT NOT NULL DEFAULT '0',
      rate_limit_per_second INTEGER,
      data_region TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(organization_id) REFERENCES organizations(id)
    );
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, user_id),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS workspace_api_keys (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      scopes TEXT DEFAULT '["chat","models","embeddings"]',
      status TEXT NOT NULL DEFAULT 'active',
      expires_at DATETIME,
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS workspace_provider_keys (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      key_version TEXT NOT NULL DEFAULT 'v1',
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, provider),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      api_key_id TEXT,
      user_id INTEGER,
      endpoint TEXT NOT NULL,
      model_id TEXT,
      provider TEXT,
      latency_ms INTEGER,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      reasoning_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      image_units INTEGER DEFAULT 0,
      cost_usd TEXT NOT NULL DEFAULT '0',
      status TEXT NOT NULL DEFAULT 'ok',
      request_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    );
    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      api_key_id TEXT,
      event_type TEXT NOT NULL,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS api_key_metrics (
      subject_id TEXT PRIMARY KEY,
      baseline_rpm REAL NOT NULL DEFAULT 1,
      last_window_count INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try { db.exec('CREATE INDEX IF NOT EXISTS idx_models_active ON models(is_active)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_usage_workspace_created ON usage_events(workspace_id, created_at)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_workspace_keys_hash ON workspace_api_keys(key_hash)'); } catch (_) {}
}

function seedDefaultModels(db) {
  const upsert = db.prepare(`
    INSERT INTO models (id, name, context_length, pricing, architecture, provider, data_regions, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      context_length = excluded.context_length,
      pricing = excluded.pricing,
      architecture = excluded.architecture,
      provider = excluded.provider,
      data_regions = excluded.data_regions,
      is_active = 1,
      updated_at = CURRENT_TIMESTAMP
  `);
  const insertMany = db.transaction((models) => {
    for (const model of models) {
      upsert.run(
        model.id,
        model.name,
        model.context_length,
        jsonString({ ...DEFAULT_PRICING, ...model.pricing }),
        jsonString({ ...DEFAULT_ARCHITECTURE, ...model.architecture }),
        model.provider || null,
        jsonString(model.data_regions || ['US'])
      );
    }
  });
  insertMany(DEFAULT_MODELS);
}

function getActiveModels(db) {
  const rows = db.prepare('SELECT id, name, architecture, pricing, context_length FROM models WHERE is_active = 1 ORDER BY name ASC').all();
  return rows.map(normalizeModelRow);
}

function getModelById(db, id) {
  const row = db.prepare('SELECT * FROM models WHERE id = ? AND is_active = 1').get(id);
  if (!row) return null;
  return { ...normalizeModelRow(row), provider: row.provider, data_regions: safeJsonParse(row.data_regions, ['US']) };
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

module.exports = {
  PRICING_KEYS,
  DEFAULT_PRICING,
  DEFAULT_ARCHITECTURE,
  DEFAULT_MODELS,
  createId,
  getActiveModels,
  getModelById,
  initGatewaySchema,
  normalizeArchitecture,
  normalizeModelRow,
  normalizePricing,
  safeJsonParse,
  seedDefaultModels
};
