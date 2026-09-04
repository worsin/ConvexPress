// Prove the assistant column animates instead of snapping: open it and sample
// its width every 60ms, then screenshot the open state.
//   node probe-rail.mjs <baseUrl> <outDir>
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [base, outDir] = process.argv.slice(2);
const admin = "/Users/worsin/Development/ConvexPress/ConvexPress-Admin/node_modules/.bun";
const entries = (await readdir(admin)).filter((e) => e.startsWith("playwright@")).sort();
const { chromium } = await import(pathToFileURL(join(admin, entries.at(-1), "node_modules/playwright/index.mjs")).href);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.route(/192\.168\.1\.246:(48\d\d)/, (route) => {
  const url = new URL(route.request().url());
  url.hostname = "127.0.0.1";
  url.port = `1${url.port}`;
  route.continue({ url: url.toString() });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base + "/products", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const aside = page.locator('aside[aria-label]:not([aria-label="Your cart"]):not([aria-label="Filters"])').first();
const widthAt = () => aside.evaluate((el) => Math.round(el.getBoundingClientRect().width));
const layout = await page.locator("[data-slot=shop-shell]").getAttribute("data-layout");
console.log("layout:", layout, "rail width before:", await widthAt(), "cart column:", await page.locator('aside[aria-label="Your cart"]').count());
await page.screenshot({ path: join(outDir, "rail-closed.png") });
const samples = [];
await page.getByRole("button", { name: /^Ask / }).first().click();
for (let i = 0; i < 9; i++) {
  samples.push(await widthAt());
  await page.waitForTimeout(60);
}
console.log("width samples after click (60ms apart):", samples.join(" → "));
await page.waitForTimeout(1200);
await page.screenshot({ path: join(outDir, "rail-open.png") });
// Scrollbar styling inside the rail
const sb = await page.evaluate(() => {
  const el = document.querySelector('aside[aria-label] [class*="overflow-y-auto"]');
  const cs = el ? getComputedStyle(el) : null;
  return cs ? { scrollbarWidth: cs.scrollbarWidth, scrollbarColor: cs.scrollbarColor, colorScheme: getComputedStyle(document.documentElement).colorScheme } : null;
});
console.log("rail scroll styling:", JSON.stringify(sb));
// Close and sample again
await page.getByRole("button", { name: /^Close / }).first().click();
const closing = [];
for (let i = 0; i < 9; i++) {
  closing.push(await widthAt());
  await page.waitForTimeout(60);
}
console.log("width samples while closing:", closing.join(" → "));
console.log("page errors:", errors.length ? errors.slice(0, 3) : "none");
await browser.close();
