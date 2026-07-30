const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const databasePath = process.env.DATABASE_PATH;
const jwtSecret = process.env.JWT_SECRET;
const baseUrl = String(process.env.ACCEPTANCE_BASE_URL || 'http://localhost:3199/api/').replace(/\/?$/, '/');

if (!databasePath || !jwtSecret) {
  throw new Error('DATABASE_PATH and JWT_SECRET are required.');
}

const db = new Database(databasePath);
const suffix = Date.now();

function addUser(email) {
  const username = `acceptance_${crypto.randomBytes(4).toString('hex')}`;
  const result = db.prepare(`
    INSERT INTO users (username, email, password, credits, plan, is_admin)
    VALUES (?, ?, ?, 100, 'free', 0)
  `).run(username, email, 'acceptance-test-only');
  return { id: Number(result.lastInsertRowid), username, email, plan: 'free' };
}

function token(user) {
  return jwt.sign(user, jwtSecret, { expiresIn: '1h' });
}

async function call(path, bearer, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({}))
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const userA = addUser(`multi-a-${suffix}@example.com`);
  const userB = addUser(`multi-b-${suffix}@example.com`);
  let admin = db.prepare(
    'SELECT id, username, email, plan FROM users WHERE lower(email) = ?'
  ).get('habilrencber@gmail.com');
  if (!admin) admin = addUser('habilrencber@gmail.com');

  const tokenA = token(userA);
  const tokenB = token(userB);
  const adminToken = token(admin);

  let result = await call('me', tokenA);
  assert(result.status === 200 && result.body.user.email === userA.email, 'user A /me failed');
  assert(!result.body.user.is_admin, 'normal user unexpectedly became admin');

  result = await call('me', adminToken);
  assert(result.status === 200 && Boolean(result.body.user.is_admin), 'exclusive admin was not granted');
  assert(result.body.user.unlimited_credits === true, 'exclusive admin does not have unlimited credits');
  assert(!result.body.token, '/me leaked a session token');

  result = await call('admin/stats', tokenA);
  assert(result.status === 403, 'normal user reached admin API');
  result = await call('admin/stats', adminToken);
  assert(result.status === 200, 'exclusive admin could not reach admin API');
  result = await call('admin/activity-overview', adminToken);
  assert(result.status === 200 && Array.isArray(result.body.recent), 'activity overview failed');

  result = await call('preferences', tokenA, {
    method: 'PUT',
    body: JSON.stringify({ global_memory: 'A-only', favorite_models: ['model-a'] })
  });
  assert(result.status === 200, 'preference write failed');
  const preferencesA = await call('preferences', tokenA);
  const preferencesB = await call('preferences', tokenB);
  assert(
    preferencesA.body.global_memory === 'A-only' && preferencesB.body.global_memory === '',
    'preference isolation failed'
  );

  result = await call('documents', tokenA, {
    method: 'POST',
    body: JSON.stringify({ filename: 'a.txt', content: 'only a' })
  });
  assert(result.status === 200, 'document write failed');
  const documentsA = await call('documents', tokenA);
  const documentsB = await call('documents', tokenB);
  assert(
    documentsA.body.documents.some((item) => item.filename === 'a.txt') &&
      documentsB.body.documents.length === 0,
    'document isolation failed'
  );

  result = await call('chats', tokenA, {
    method: 'POST',
    body: JSON.stringify({
      id: `chat-a-${suffix}`,
      title: 'A',
      messages: [{ id: '1', role: 'user', content: 'secret-a' }]
    })
  });
  assert(result.status === 200, 'chat write failed');
  const chatsA = await call('chats', tokenA);
  const chatsB = await call('chats', tokenB);
  assert(
    chatsA.body.chats.some((item) => item.id === `chat-a-${suffix}`) && chatsB.body.chats.length === 0,
    'chat isolation failed'
  );

  result = await call('gallery', tokenA, {
    method: 'POST',
    body: JSON.stringify({
      url: `https://example.com/a.png?run=${suffix}`,
      prompt: 'A image',
      model: 'test',
      provider: 'test'
    })
  });
  assert(result.status === 200, 'gallery write failed');
  const galleryA = await call('gallery', tokenA);
  const galleryB = await call('gallery', tokenB);
  assert(
    galleryA.body.images.some((item) => item.prompt === 'A image') &&
      galleryB.body.images.length === 0,
    'gallery isolation failed'
  );

  const catalogResponse = await fetch(`${baseUrl}image-models?verified=1`);
  const catalog = await catalogResponse.json();
  assert(
    catalogResponse.status === 200 &&
      catalog.models.length === catalog.verifiedCount &&
      catalog.models.every((item) => item.verified === true),
    'verified model filter failed'
  );

  const oneTimeTicket = crypto.randomBytes(32).toString('base64url');
  const oneTimeTicketHash = crypto.createHash('sha256').update(oneTimeTicket).digest('hex');
  db.prepare(`
    INSERT INTO oauth_handoffs (ticket_hash, user_id, expires_at)
    VALUES (?, ?, datetime('now', '+5 minutes'))
  `).run(oneTimeTicketHash, userA.id);
  const firstExchange = await call('oauth/exchange', '', {
    method: 'POST',
    headers: { authorization: '' },
    body: JSON.stringify({ ticket: oneTimeTicket })
  });
  const replayExchange = await call('oauth/exchange', '', {
    method: 'POST',
    headers: { authorization: '' },
    body: JSON.stringify({ ticket: oneTimeTicket })
  });
  assert(firstExchange.status === 200 && replayExchange.status === 401, 'OAuth ticket replay protection failed');

  const expiredTicket = crypto.randomBytes(32).toString('base64url');
  db.prepare(`
    INSERT INTO oauth_handoffs (ticket_hash, user_id, expires_at)
    VALUES (?, ?, datetime('now', '-1 minute'))
  `).run(crypto.createHash('sha256').update(expiredTicket).digest('hex'), userA.id);
  const expiredExchange = await call('oauth/exchange', '', {
    method: 'POST',
    headers: { authorization: '' },
    body: JSON.stringify({ ticket: expiredTicket })
  });
  assert(expiredExchange.status === 401, 'expired OAuth ticket was accepted');

  console.log(JSON.stringify({
    ok: true,
    tests: [
      'me',
      'exclusive-admin',
      'unlimited-admin-credit',
      'me-token-secrecy',
      'admin-denial',
      'admin-activity-overview',
      'preferences-isolation',
      'documents-isolation',
      'chats-isolation',
      'gallery-isolation',
      'verified-model-filter',
      'oauth-ticket-single-use',
      'oauth-ticket-expiry'
    ],
    verifiedModels: catalog.models.length
  }));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
