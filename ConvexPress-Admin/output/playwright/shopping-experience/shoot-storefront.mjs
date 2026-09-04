// Screenshot a running storefront's key pages (desktop + one mobile shot).
//   node shoot-storefront.mjs <baseUrl> <outDir> [paths...]
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [base, outDir, ...extra] = process.argv.slice(2);
const paths = extra.length ? extra : ["/", "/our-story", "/help", "/contact", "/products", "/products?category=accessories"];
const admin = "/Users/worsin/Development/ConvexPress/ConvexPress-Admin/node_modules/.bun";
const entries = (await readdir(admin)).filter((e) => e.startsWith("playwright@")).sort();
const { chromium } = await import(pathToFileURL(join(admin, entries.at(-1), "node_modules/playwright/index.mjs")).href);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
// Media lives on the worker deployments; this Mac reaches them through the SSH tunnel.
await context.route(/192\.168\.1\.246:(48\d\d)/, (route) => {
  const url = new URL(route.request().url());
  url.hostname = "127.0.0.1";
  url.port = `1${url.port}`;
  route.continue({ url: url.toString() });
});
const page = await context.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

for (const path of paths) {
  const name = path === "/" ? "home" : path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 60_000 }).catch((e) => console.log("nav", path, e.message));
  await page.waitForTimeout(2500);
  // Let lazy images settle.
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 1200));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 500));
  });
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  const title = await page.title();
  const nav = await page.locator("header nav a").allTextContents().catch(() => []);
  const footerLinks = await page.locator("footer a").allTextContents().catch(() => []);
  const h1 = await page.locator("h1").first().textContent().catch(() => null);
  console.log(JSON.stringify({ path, title, h1: h1?.trim(), nav: nav.map((t) => t.trim()).filter(Boolean), footer: footerLinks.map((t) => t.trim()).filter(Boolean).slice(0, 12) }));
}
// One mobile view of the homepage.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + "/", { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: join(outDir, "home-mobile.png"), fullPage: true });
console.log("errors:", [...new Set(errors)].slice(0, 10));
await browser.close();
