const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
const port = 4320;
const upstreamPort = 4321;
const base = `http://127.0.0.1:${port}`;
const tempDir = path.resolve(root, 'tmp-plan-test', 'v570');
const databasePath = path.join(tempDir, 'froxy-plan-acceptance.sqlite');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 75; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Local test server did not become ready.');
}

async function request(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function register({ username, email, password }) {
  const { response, payload } = await request('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      email,
      password,
      termsAccepted: true,
      privacyAccepted: true,
      marketingOptIn: false
    })
  });
  assert(response.ok && payload.token && payload.user, `Registration failed for ${email}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function main() {
  // Make the file first so server.js cannot copy the local development DB into
  // this isolated acceptance database.
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.closeSync(fs.openSync(databasePath, 'w'));

  const upstream = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'mock-chat-v570',
        object: 'chat.completion',
        model: 'test-model',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Mock yanit' }, finish_reason: 'stop' }]
      }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise(resolve => upstream.listen(upstreamPort, '127.0.0.1', resolve));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      GENERATED_DIR: path.join(tempDir, 'generated'),
      JWT_SECRET: 'froxy-local-v570-plan-test',
      NODE_ENV: 'test',
      LOGIN_OTP_ENABLED: '0',
      TURNSTILE_REQUIRED: '0',
      SHOPIER_CALLBACK_SECRET: 'froxy-v570-shopier-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  child.stdout.on('data', chunk => { output += chunk.toString(); });

  try {
    await waitForHealth();
    const admin = await register({
      username: 'Froxy Test Admin',
      email: 'habilrencber@gmail.com',
      password: 'Froxy-Acceptance-570!'
    });
    const customer = await register({
      username: 'Plan Test Customer',
      email: 'plan.acceptance.customer@gmail.com',
      password: 'Froxy-Acceptance-570!'
    });
    const paymentCustomer = await register({
      username: 'Payment Test Customer',
      email: 'payment.acceptance.customer@gmail.com',
      password: 'Froxy-Acceptance-570!'
    });
    const adminHeaders = { authorization: `Bearer ${admin.token}`, 'content-type': 'application/json' };
    const customerHeaders = { authorization: `Bearer ${customer.token}`, 'content-type': 'application/json' };
    const paymentCustomerHeaders = { authorization: `Bearer ${paymentCustomer.token}`, 'content-type': 'application/json' };

    const initial = await request('/api/me', { headers: customerHeaders });
    assert(initial.response.ok, `Initial /api/me failed: ${initial.response.status}`);
    assert(initial.payload.user?.plan === 'free' && initial.payload.user?.credits === 100, 'New account did not receive expected free plan / credits.');
    assert(initial.payload.limits?.chat === 10 && initial.payload.limits?.image === 3, 'Free daily limits are wrong.');

    const paymentId = 'shopier-v570-popular-1';
    const paymentPayload = {
      payment_id: paymentId,
      platform_order_id: `FRX-${paymentCustomer.user.id}-popular-570`,
      product_id: '47408138',
      status: 'paid',
      total_order_value: '249.99',
      currency: 'TRY'
    };
    const paymentHeaders = {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-froxy-webhook-secret': 'froxy-v570-shopier-secret'
    };
    const firstPayment = await request('/api/shopier/callback', {
      method: 'POST', headers: paymentHeaders, body: JSON.stringify(paymentPayload)
    });
    assert(firstPayment.response.ok && firstPayment.payload.status === 'applied', `Shopier package application failed: ${firstPayment.response.status} ${JSON.stringify(firstPayment.payload)}`);
    assert(firstPayment.payload.plan === 'popular' && firstPayment.payload.credits === 15000, 'Shopier selected an incorrect package.');
    const duplicatePayment = await request('/api/shopier/callback', {
      method: 'POST', headers: paymentHeaders, body: JSON.stringify(paymentPayload)
    });
    assert(duplicatePayment.response.ok && duplicatePayment.payload.status === 'already_applied', 'Duplicate Shopier callback was not idempotent.');
    const paidSession = await request('/api/me', { headers: paymentCustomerHeaders });
    assert(paidSession.payload.user?.plan === 'popular' && paidSession.payload.user?.credits === 15100, 'Shopier payment did not add credits exactly once.');
    assert(paidSession.payload.limits?.chat === 500 && paidSession.payload.limits?.image === 150, 'Shopier payment did not apply popular limits.');

    const invalidMembershipCode = await request('/api/admin/membership-codes', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ code: 'FRX-INVALID-CREATOR', plan: 'creator', credits: 1 })
    });
    assert(invalidMembershipCode.response.status === 400, 'Retired plan was allowed for a new membership code.');
    const validMembershipCode = await request('/api/admin/membership-codes', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ code: 'FRX-VALID-PRO', plan: 'pro', credits: 1234, max_uses: 1 })
    });
    assert(validMembershipCode.response.ok, `Valid membership code could not be created: ${validMembershipCode.response.status}`);
    const redeemValid = await request('/api/redeem-code', {
      method: 'POST', headers: paymentCustomerHeaders,
      body: JSON.stringify({ code: 'FRX-VALID-PRO' })
    });
    assert(redeemValid.response.ok && redeemValid.payload.user?.plan === 'pro' && redeemValid.payload.user?.credits === 16334, 'Valid membership code did not apply its plan and credits.');
    const legacyCodeDb = new Database(databasePath);
    legacyCodeDb.prepare(`INSERT INTO membership_codes (code, plan, credits, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)`)
      .run('FRX-LEGACY-CREATOR', 'creator', 999, 1, new Date(Date.now() + 86400000).toISOString());
    legacyCodeDb.close();
    const redeemLegacy = await request('/api/redeem-code', {
      method: 'POST', headers: paymentCustomerHeaders,
      body: JSON.stringify({ code: 'FRX-LEGACY-CREATOR' })
    });
    assert(redeemLegacy.response.status === 400, 'Legacy invalid membership code was allowed to downgrade limits.');

    const paidPlans = [
      { id: 'starter', credits: 5_000, chat: 200, image: 50 },
      { id: 'popular', credits: 15_000, chat: 500, image: 150 },
      { id: 'pro', credits: 50_000, chat: 1_500, image: 400 },
      { id: 'developer', credits: 100_000, chat: 3_000, image: 800 },
      { id: 'business', credits: 150_000, chat: 5_000, image: 1_500 },
      { id: 'enterprise', credits: 500_000, chat: 999_999, image: 999_999 }
    ];
    const upgrades = [];
    let expectedCredits = 100;
    for (const plan of paidPlans) {
      const upgrade = await request(`/api/admin/users/${customer.user.id}/plan`, {
        method: 'PUT', headers: adminHeaders,
        body: JSON.stringify({ plan: plan.id, apply_package: true })
      });
      expectedCredits += plan.credits;
      assert(upgrade.response.ok, `${plan.id} assignment failed: ${upgrade.response.status} ${JSON.stringify(upgrade.payload)}`);
      assert(upgrade.payload.credits_added === plan.credits, `${plan.id} package applied an incorrect credit amount.`);
      assert(upgrade.payload.user?.plan === plan.id && upgrade.payload.user?.credits === expectedCredits, `${plan.id} package applied an incorrect plan or balance.`);
      assert(upgrade.payload.daily_limits?.chat === plan.chat && upgrade.payload.daily_limits?.image === plan.image, `${plan.id} daily limits are wrong.`);
      const sessionAfterUpgrade = await request('/api/me', { headers: customerHeaders });
      assert(sessionAfterUpgrade.response.ok, `Customer session failed after ${plan.id} upgrade.`);
      assert(sessionAfterUpgrade.payload.user?.plan === plan.id && sessionAfterUpgrade.payload.user?.credits === expectedCredits, `Customer session did not see ${plan.id} balance.`);
      assert(sessionAfterUpgrade.payload.limits?.chat === plan.chat && sessionAfterUpgrade.payload.limits?.image === plan.image, `Customer session did not see ${plan.id} limits.`);
      upgrades.push({ ...plan, totalCredits: expectedCredits });
    }

    // The API-compatible endpoint deliberately uses a local mock upstream so
    // this verifies server-side chat billing without a real provider request.
    const chat = await request('/v1/chat/completions', {
      method: 'POST', headers: customerHeaders,
      body: JSON.stringify({
        model: 'test-model',
        provider: 'openai',
        apiKey: 'test-key',
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        messages: [{ role: 'user', content: 'Sadece mock yanit ver.' }]
      })
    });
    assert(chat.response.ok && chat.payload.choices?.[0]?.message?.content === 'Mock yanit', `Mock chat failed: ${chat.response.status} ${JSON.stringify(chat.payload)}`);
    assert(chat.payload.froxy_usage?.cost === 8 && chat.payload.froxy_usage?.remaining === 820092, 'Successful chat did not settle its 8-credit usage server-side.');

    const legacyDeduct = await request('/api/deduct-credit', {
      method: 'POST', headers: customerHeaders,
      body: JSON.stringify({ model: 'test-model', provider: 'openai' })
    });
    assert(legacyDeduct.response.ok && legacyDeduct.payload.handled_by_server === true, 'Legacy credit endpoint was not made safe.');
    const afterChat = await request('/api/me', { headers: customerHeaders });
    assert(afterChat.payload.user?.credits === 820092, 'Legacy credit endpoint double-charged a completed chat.');

    const invalid = await request(`/api/admin/users/${customer.user.id}/plan`, {
      method: 'PUT', headers: adminHeaders,
      body: JSON.stringify({ plan: 'creator', apply_package: true })
    });
    assert(invalid.response.status === 400, `Retired plan was accepted: ${invalid.response.status} ${JSON.stringify(invalid.payload)}`);

    const adminUsers = await request('/api/admin/users?limit=20', { headers: adminHeaders });
    const adminCustomer = adminUsers.payload.users?.find(user => user.id === customer.user.id);
    assert(adminUsers.response.ok && adminCustomer, 'Admin users endpoint did not return customer.');
    assert(adminCustomer.daily_limits?.chat === 999999 && adminCustomer.daily_limits?.image === 999999, 'Admin user list did not expose the actual daily limits.');

    // Daily limits are enforced before an image provider is contacted. Setting
    // the counter in the isolated DB lets us test that boundary with no paid
    // provider call.
    const inspector = new Database(databasePath);
    inspector.prepare('UPDATE users SET daily_image_count = 999999, daily_reset_date = ? WHERE id = ?')
      .run(new Date().toISOString().slice(0, 10), customer.user.id);
    inspector.close();
    const imageLimit = await request('/api/deduct-image-credit', {
      method: 'POST', headers: customerHeaders,
      body: JSON.stringify({ model: 'cf-sdxl', provider: 'cloudflare' })
    });
    assert(imageLimit.response.status === 429, `Image daily limit did not block at 999,999: ${imageLimit.response.status} ${JSON.stringify(imageLimit.payload)}`);

    const chatInspector = new Database(databasePath);
    chatInspector.prepare('UPDATE users SET daily_chat_count = 999999, daily_reset_date = ? WHERE id = ?')
      .run(new Date().toISOString().slice(0, 10), customer.user.id);
    chatInspector.close();
    const chatLimit = await request('/v1/chat/completions', {
      method: 'POST', headers: customerHeaders,
      body: JSON.stringify({
        model: 'test-model',
        provider: 'openai',
        apiKey: 'test-key',
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        messages: [{ role: 'user', content: 'Bu istek limitte engellenmeli.' }]
      })
    });
    assert(chatLimit.response.status === 429, `Chat daily limit did not block at 999,999: ${chatLimit.response.status} ${JSON.stringify(chatLimit.payload)}`);

    const free = await request(`/api/admin/users/${customer.user.id}/plan`, {
      method: 'PUT', headers: adminHeaders,
      body: JSON.stringify({ plan: 'free', apply_package: false })
    });
    assert(free.response.ok && free.payload.credits_added === 0, 'Free plan change should not add credits.');
    assert(free.payload.user?.credits === 820092, 'Changing to free should not silently delete paid credits.');

    process.stdout.write(`${JSON.stringify({
      ok: true,
      shopierPayment: { first: firstPayment.payload.status, duplicate: duplicatePayment.payload.status, credits: paidSession.payload.user?.credits },
      membershipCodes: { validPlan: redeemValid.payload.user?.plan, legacyPlanBlocked: redeemLegacy.response.status },
      upgradedPlans: upgrades,
      serverSideChatCharge: chat.payload.froxy_usage,
      legacyChatDeductNoop: legacyDeduct.payload.handled_by_server,
      retiredPlanRejected: invalid.response.status,
      imageDailyLimitBlocked: imageLimit.response.status,
      chatDailyLimitBlocked: chatLimit.response.status,
      freePlanPreservesCredits: free.payload.user?.credits
    }, null, 2)}\n`);
  } finally {
    child.kill();
    await new Promise(resolve => child.once('exit', resolve));
    await new Promise(resolve => upstream.close(resolve));
    if (output.includes('SyntaxError')) process.stderr.write(output);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
