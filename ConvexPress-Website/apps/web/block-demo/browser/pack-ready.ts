import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

export async function selectPackReady(page: Page, pack: string) {
  const manifest = JSON.parse(readFileSync(new URL(`../../src/templates/packs/${pack}/template.json`, import.meta.url), "utf8"));
  await page.locator("#pack").selectOption(pack);
  await expect(page.locator(".theme-status strong")).toHaveText(manifest.name);
  // fonts.ready alone can resolve before a newly selected stylesheet has loaded.
  await expect.poll(() => page.locator('link[rel="stylesheet"][href*="fonts.googleapis.com"]').evaluateAll(links => links.every(link => link instanceof HTMLLinkElement && link.sheet !== null)), { message: `${pack}: font stylesheet loaded` }).toBe(true);
  await page.evaluate(() => document.fonts.ready);
}
