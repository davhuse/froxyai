const crypto = require('crypto');
const { createId, safeJsonParse } = require('./model-catalog');

function optionalRequire(name) {
  try { return require(name); } catch (_) { return null; }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function getMasterKey() {
  const configured = process.env.GATEWAY_MASTER_KEY || process.env.BYOK_MASTER_KEY || '';
  if (configured) {
    if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
    return crypto.createHash('sha256').update(configured).digest();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('GATEWAY_MASTER_KEY is required in production for BYOK encryption');
  }
  return crypto.createHash('sha256').update('froxy-dev-master-key-replace-in-production').digest();
}

function encryptProviderKey(plainText) {
  if (!plainText || typeof plainText !== 'string') throw new Error('Provider key is required');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted_key: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
    key_version: 'v1'
  };
}

function decryptProviderKey(record) {
  if (!record || !record.encrypted_key || !record.iv || !record.auth_tag) throw new Error('Encrypted provider key is incomplete');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.auth_tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(record.encrypted_key, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

function getClientIp(req) {
  return req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.ip ||
    req.connection?.remoteAddress ||
    '127.0.0.1';
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function createRedisClientFactory() {
  let clientPromise = null;
  return async function getRedisClient() {
    if (!process.env.REDIS_URL) return null;
    if (clientPromise) return clientPromise;
    const redis = optionalRequire('redis');
    if (!redis || !redis.createClient) return null;
    clientPromise = (async () => {
      const client = redis.createClient({ url: process.env.REDIS_URL });
      client.on('error', (err) => console.warn('[REDIS]', err.message));
      await client.connect();
      return client;
    })().catch((err) => {
      console.warn('[REDIS] disabled:', err.message);
      clientPromise = null;
      return null;
    });
    return clientPromise;
  };
}

const getRedisClient = createRedisClientFactory();

function ensureDefaultWorkspace(db, user) {
  const userId = Number(user.id);
  const organizationId = `org_user_${userId}`;
  const workspaceId = `ws_user_${userId}`;
  const userRow = db.prepare('SELECT id, username, email, credits, plan FROM users WHERE id = ?').get(userId);
  const credits = Number(userRow?.credits || 0);
  const creditUsdValue = Number(process.env.GATEWAY_CREDIT_USD_VALUE || '0.01');
  const initialBalance = Math.max(0, credits * creditUsdValue).toFixed(6);

  const existing = db.prepare('SELECT id, balance_usd, status FROM workspaces WHERE id = ?').get(workspaceId);
  if (!existing) {
    db.prepare('INSERT OR IGNORE INTO organizations (id, name, owner_user_id) VALUES (?, ?, ?)')
      .run(organizationId, userRow?.username || userRow?.email || `User ${userId}`, userId);
    db.prepare('INSERT INTO workspaces (id, organization_id, name, plan, balance_usd, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(workspaceId, organizationId, 'Personal Workspace', userRow?.plan || user.plan || 'free', initialBalance, 'active');
    db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
      .run(workspaceId, userId, 'owner');
  } else {
    db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
      .run(workspaceId, userId, 'owner');
  }
  return db.prepare('SELECT w.*, o.status AS organization_status FROM workspaces w JOIN organizations o ON o.id = w.organization_id WHERE w.id = ?').get(workspaceId);
}

function createWorkspaceApiKey(db, workspaceId, name = 'Default API Key', scopes = ['chat', 'models', 'embeddings']) {
  const secret = `fx_${crypto.randomBytes(28).toString('base64url')}`;
  const id = createId('key');
  db.prepare(`
    INSERT INTO workspace_api_keys (id, workspace_id, name, key_prefix, key_hash, scopes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, workspaceId, name, secret.slice(0, 10), sha256(secret), JSON.stringify(scopes));
  return { id, key: secret, prefix: secret.slice(0, 10) };
}

function openAiError(res, status, message, type = 'invalid_request_error') {
  return res.status(status).json({ error: { message, type } });
}

const lastApiKeyUsedUpdate = new Map();
const lastMetricUpdate = new Map();

function createGatewayAuth({ db, jwt, activeJwtSecret }) {
  return async function gatewayAuthMiddleware(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!match) return openAiError(res, 401, 'Bearer token is required', 'authentication_error');
      const token = match[1].trim();
      if (!token) return openAiError(res, 401, 'Bearer token is empty', 'authentication_error');

      const keyHash = sha256(token);
      const apiKey = db.prepare(`
        SELECT k.*, w.organization_id, w.plan, w.balance_usd, w.status AS workspace_status, w.data_region, w.rate_limit_per_second,
               o.status AS organization_status
        FROM workspace_api_keys k
        JOIN workspaces w ON w.id = k.workspace_id
        JOIN organizations o ON o.id = w.organization_id
        WHERE k.key_hash = ?
      `).get(keyHash);

      if (apiKey) {
        if (apiKey.status !== 'active') return openAiError(res, 403, 'API key is not active', 'authentication_error');
        if (apiKey.workspace_status !== 'active' || apiKey.organization_status !== 'active') return openAiError(res, 403, 'Workspace is not active', 'authentication_error');
        if (apiKey.expires_at && new Date(apiKey.expires_at).getTime() <= Date.now()) return openAiError(res, 403, 'API key expired', 'authentication_error');
        
        const now = Date.now();
        const lastUsedUpdate = lastApiKeyUsedUpdate.get(apiKey.id) || 0;
        if (now - lastUsedUpdate > 30000) { // update last_used_at at most once every 30 seconds
          lastApiKeyUsedUpdate.set(apiKey.id, now);
          setImmediate(() => {
            try { db.prepare('UPDATE workspace_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(apiKey.id); } catch(_) {}
          });
        }
        req.gatewayAuth = {
          type: 'api_key',
          apiKeyId: apiKey.id,
          workspaceId: apiKey.workspace_id,
          organizationId: apiKey.organization_id,
          plan: apiKey.plan || 'free',
          scopes: safeJsonParse(apiKey.scopes, []),
          dataRegion: apiKey.data_region || null,
          rateLimitPerSecond: apiKey.rate_limit_per_second || null,
          balanceKey: `balance:workspace:${apiKey.workspace_id}`
        };
        return next();
      }

      let decoded;
      try {
        decoded = jwt.verify(token, activeJwtSecret);
      } catch (_) {
        return openAiError(res, 403, 'Invalid bearer token', 'authentication_error');
      }
      const user = db.prepare('SELECT id, username, email, plan, is_blocked, block_until FROM users WHERE id = ?').get(decoded.id);
      if (!user) return openAiError(res, 401, 'User not found', 'authentication_error');
      if (user.is_blocked) {
        if (!user.block_until || new Date(user.block_until).getTime() > Date.now()) {
          return openAiError(res, 403, 'Account is blocked', 'authentication_error');
        }
        db.prepare('UPDATE users SET is_blocked = 0, blocked_at = NULL, block_until = NULL, block_reason = NULL WHERE id = ?').run(user.id);
      }
      const workspace = ensureDefaultWorkspace(db, user);
      if (workspace.status !== 'active' || workspace.organization_status !== 'active') return openAiError(res, 403, 'Workspace is not active', 'authentication_error');
      req.user = decoded;
      req.gatewayAuth = {
        type: 'jwt',
        userId: user.id,
        workspaceId: workspace.id,
        organizationId: workspace.organization_id,
        plan: workspace.plan || user.plan || 'free',
        scopes: ['chat', 'models', 'embeddings'],
        dataRegion: workspace.data_region || null,
        rateLimitPerSecond: workspace.rate_limit_per_second || null,
        balanceKey: `balance:workspace:${workspace.id}`
      };
      return next();
    } catch (err) {
      console.error('[GATEWAY_AUTH]', err);
      return openAiError(res, 500, 'Authentication failed', 'server_error');
    }
  };
}

const memoryWindows = new Map();

async function incrementRedisWindow(redis, key, ttlSeconds) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttlSeconds);
  return count;
}

function incrementMemoryWindow(key, ttlMs) {
  const now = Date.now();
  const existing = memoryWindows.get(key);
  if (!existing || existing.expiresAt <= now) {
    memoryWindows.set(key, { count: 1, expiresAt: now + ttlMs });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

function createGatewayRateLimiter() {
  return async function gatewayRateLimitMiddleware(req, res, next) {
    try {
      const auth = req.gatewayAuth || {};
      const plan = auth.plan || 'free';
      const subject = auth.workspaceId || getClientIp(req);
      const redis = await getRedisClient();

      if (plan === 'free') {
        const key = `rl:gateway:${subject}:day:${getToday()}`;
        const used = redis ? await incrementRedisWindow(redis, key, 86400) : incrementMemoryWindow(key, 86400000);
        if (used > 50) {
          res.setHeader('Retry-After', '86400');
          return openAiError(res, 429, 'Free tier daily request limit exceeded (50 reqs/day)', 'rate_limit_error');
        }
        res.setHeader('X-RateLimit-Limit', '50');
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, 50 - used)));
        return next();
      }

      const limit = Number(auth.rateLimitPerSecond || process.env.GATEWAY_DEFAULT_RPS || (plan === 'enterprise' ? 500 : 100));
      const key = `rl:gateway:${subject}:sec:${Math.floor(Date.now() / 1000)}`;
      const used = redis ? await incrementRedisWindow(redis, key, 2) : incrementMemoryWindow(key, 2000);
      if (used > limit) {
        res.setHeader('Retry-After', '1');
        return openAiError(res, 429, `Rate limit exceeded (${limit} reqs/sec)`, 'rate_limit_error');
      }
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - used)));
      return next();
    } catch (err) {
      console.warn('[GATEWAY_RATE_LIMIT]', err.message);
      return next();
    }
  };
}

function createAnomalyDetector({ db }) {
  return async function anomalyMiddleware(req, res, next) {
    try {
      const auth = req.gatewayAuth || {};
      const subject = auth.apiKeyId || auth.workspaceId;
      if (!subject) return next();
      const redis = await getRedisClient();
      const key = `anom:${subject}:${Math.floor(Date.now() / 300000)}`;
      const count = redis ? await incrementRedisWindow(redis, key, 600) : incrementMemoryWindow(key, 600000);
      const metric = db.prepare('SELECT baseline_rpm FROM api_key_metrics WHERE subject_id = ?').get(subject);
      const baselineRpm = Math.max(1, Number(metric?.baseline_rpm || 1));
      const baselineFiveMin = baselineRpm * 5;
      if (count >= 100 && count > baselineFiveMin * 100) {
        const detail = JSON.stringify({ count_5m: count, baseline_rpm: baselineRpm, ip: getClientIp(req) });
        db.prepare('INSERT INTO security_events (id, workspace_id, api_key_id, event_type, detail) VALUES (?, ?, ?, ?, ?)')
          .run(createId('sec'), auth.workspaceId || null, auth.apiKeyId || null, 'api_key_anomaly_freeze', detail);
        if (auth.apiKeyId) db.prepare("UPDATE workspace_api_keys SET status = 'suspended' WHERE id = ?").run(auth.apiKeyId);
        if (auth.workspaceId) db.prepare("UPDATE workspaces SET status = 'suspended' WHERE id = ?").run(auth.workspaceId);
        return openAiError(res, 403, 'API key temporarily suspended due to anomalous traffic', 'authentication_error');
      }
      const now = Date.now();
      const lastUpdate = lastMetricUpdate.get(subject) || 0;
      if (now - lastUpdate > 10000) { // update metrics baseline at most once every 10 seconds per subject
        lastMetricUpdate.set(subject, now);
        setImmediate(() => {
          try {
            const currentRpm = count / 5;
            const nextBaseline = (baselineRpm * 0.95) + (currentRpm * 0.05);
            db.prepare(`
              INSERT INTO api_key_metrics (subject_id, baseline_rpm, last_window_count, updated_at)
              VALUES (?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(subject_id) DO UPDATE SET baseline_rpm = ?, last_window_count = ?, updated_at = CURRENT_TIMESTAMP
            `).run(subject, nextBaseline, count, nextBaseline, count);
          } catch (_) {}
        });
      }
      return next();
    } catch (err) {
      console.warn('[ANOMALY]', err.message);
      return next();
    }
  };
}

module.exports = {
  createAnomalyDetector,
  createGatewayAuth,
  createGatewayRateLimiter,
  createWorkspaceApiKey,
  decryptProviderKey,
  encryptProviderKey,
  getRedisClient,
  openAiError,
  sha256
};
