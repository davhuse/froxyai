const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "generated", "real_recordings");
fs.mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    recordVideo: {
      dir: outDir,
      size: { width: 1080, height: 1920 },
    },
  });

  const page = await context.newPage();
  await page.goto("https://froxyai.com/", { waitUntil: "networkidle", timeout: 60000 });
  await sleep(1600);

  // Real user-like flow: read hero, scroll into proof/features/pricing, return to CTA.
  await page.mouse.wheel(0, 460);
  await sleep(1100);
  await page.mouse.wheel(0, 520);
  await sleep(1150);
  await page.mouse.wheel(0, 640);
  await sleep(1150);
  await page.mouse.wheel(0, 720);
  await sleep(1300);
  await page.mouse.wheel(0, 820);
  await sleep(1200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(1700);

  const links = await page.locator("a,button").evaluateAll((els) =>
    els
      .map((el) => ({
        text: (el.innerText || el.textContent || "").trim(),
        href: el.href || "",
      }))
      .filter((x) => /başla|dene|giriş|kayıt|ücretsiz|panel/i.test(x.text))
      .slice(0, 10)
  );

  // Click a CTA if it is clearly available; if it opens a modal/page, that becomes part of the real demo.
  const cta = page
    .locator("a,button")
    .filter({ hasText: /ücretsiz|başla|dene|panel|giriş/i })
    .first();
  if ((await cta.count()) > 0) {
    await cta.click({ timeout: 5000 }).catch(() => {});
    await sleep(1800);
  }

  await page.evaluate((links) => console.log(JSON.stringify({ links })), links);
  await sleep(700);
  await context.close();
  await browser.close();

  const files = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => path.join(outDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  console.log(files[0] || "");
})();
