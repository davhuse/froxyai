const { chromium } = require('playwright');

async function main() {
    console.log("🚀 Starting Comprehensive Live Check-Up for https://froxyai.com/?t=v219");
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    const page = await ctx.newPage();

    const consoleErrors = [];
    const logs = [];
    const networkRequests = [];

    page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error') {
            consoleErrors.push(`[CONSOLE_ERROR] ${text}`);
        } else {
            logs.push(`[CONSOLE] ${text}`);
        }
    });

    page.on('pageerror', err => {
        consoleErrors.push(`[PAGE_ERROR] ${err.message}`);
    });

    page.on('request', req => {
        networkRequests.push({
            url: req.url(),
            method: req.method(),
            resourceType: req.resourceType()
        });
    });

    page.on('response', res => {
        if (res.status() >= 400) {
            console.log(`📡 [NET_ERROR] ${res.status()} ${res.request().method()} -> ${res.url()}`);
        }
    });

    try {
        console.log("🌐 Navigating to landing page...");
        const response = await page.goto('https://froxyai.com/?t=v219', {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        console.log(`📡 Landing response status: ${response.status()}`);

        // 1. Check basic page layout
        const title = await page.title();
        console.log(`🏷️ Page Title: "${title}"`);

        // Check if main elements exist
        const hasNav = await page.locator('nav.nav').isVisible();
        const hasHero = await page.locator('section.hero').isVisible();
        const hasPricing = await page.locator('#pricing').isVisible();
        console.log(`🔍 Structural Elements: Nav=${hasNav}, Hero=${hasHero}, Pricing=${hasPricing}`);

        // 2. Open Auth Modal
        console.log("👤 Testing Authentication Modal interaction...");
        const hasModalButton = await page.locator('button:has-text("Giriş Yap")').first().isVisible();
        if (hasModalButton) {
            await page.locator('button:has-text("Giriş Yap")').first().click();
            await page.waitForTimeout(1000);
            const isModalOpen = await page.locator('#auth-modal').evaluate(el => el.classList.contains('open') || window.getComputedStyle(el).display !== 'none');
            console.log(`🚪 Auth Modal Open State: ${isModalOpen}`);
        } else {
            console.warn("⚠️ 'Giriş Yap' button not visible or found.");
        }

        // 3. Mock login & dashboard state
        console.log("💻 Simulating Dashboard Access...");
        await page.evaluate(() => {
            if (typeof closeM === 'function') closeM();
            localStorage.setItem('saas_token', 'mock_token_for_validation');
            localStorage.setItem('saas_user', JSON.stringify({
                id: 9999,
                username: 'tester',
                email: 'tester@froxyai.com',
                credits: 25000,
                plan: 'pro',
                is_admin: 0
            }));
        });
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        // Check if panel UI loaded
        const isChatVisible = await page.evaluate(() => {
            const chatEl = document.getElementById('v-chat');
            return chatEl && (window.getComputedStyle(chatEl).display !== 'none' || chatEl.classList.contains('on'));
        });
        console.log(`🤖 Dashboard/Chat active: ${isChatVisible}`);

        // 4. Tab navigation testing
        console.log("📂 Testing panel tab navigation...");
        const tabsToTest = [
            'chat', 'dash', 'rag', 'keys', 'img', 'support', 
            'prompts', 'personas', 'store', 'codeeditor', 
            'agents', 'tools', 'gallery', 'analytics', 'tasks'
        ];
        const tabStates = {};
        for (const t of tabsToTest) {
            await page.evaluate((tabName) => {
                if (typeof panelTab === 'function') panelTab(tabName);
            }, t);
            await page.waitForTimeout(500);
            tabStates[t] = await page.evaluate((tabName) => {
                const el = document.getElementById(`ptab-${tabName}`);
                return el ? (window.getComputedStyle(el).display !== 'none' || el.classList.contains('on')) : false;
            }, t);
        }
        console.log("📋 Tab Navigation states:", JSON.stringify(tabStates, null, 2));

        // 5. Audit static asset sizing and count
        const scriptUrls = networkRequests.filter(r => r.resourceType === 'script').map(r => r.url);
        const cssUrls = networkRequests.filter(r => r.resourceType === 'stylesheet').map(r => r.url);
        console.log(`📦 Resource counts: Scripts=${scriptUrls.length}, Stylesheets=${cssUrls.length}`);
        
        console.log("\n❌ Console Errors Found during test:");
        if (consoleErrors.length === 0) {
            console.log("  None! Perfect client-side integrity.");
        } else {
            consoleErrors.forEach(err => console.log(`  - ${err}`));
        }

    } catch (err) {
        console.error("❌ Exception during comprehensive live check-up:", err);
    } finally {
        await browser.close();
        console.log("🏁 Comprehensive Live Check-Up Finished.");
    }
}

main();
