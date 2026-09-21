import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
const root = new URL("../../src/templates/packs/", import.meta.url);
const packs = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const size = (nodes: { children?: any[] }[]): number => nodes.reduce((count, node) => count + 1 + size(node.children ?? []), 0);
for (const width of [1440, 390]) test(`starter patterns render as complete editable compositions · ${width}px`, async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/", { waitUntil: "networkidle" });
  let captured = 0;
  for (const pack of packs) {
    const dir = new URL(`${pack}/patterns/`, root);
    const patterns = readdirSync(dir).filter(file => file.endsWith(".json")).sort().map(file => JSON.parse(readFileSync(new URL(file, dir), "utf8")));
    await page.locator("#pack").selectOption(pack);
    await expect(page.locator("#template-pattern option")).toHaveCount(patterns.length);
    for (const pattern of patterns) {
      await page.locator("#template-pattern").selectOption(`${pack}/${pattern.id}`);
      const canvas = page.locator(".pattern-canvas");
      await expect(canvas).toHaveAttribute("data-pattern", `${pack}/${pattern.id}`);
      await expect(canvas.locator('[data-demo-ready="true"]')).toHaveCount(1);
      await expect(canvas.locator('[data-block-id]')).toHaveCount(size(pattern.blocks));
      await expect(canvas.locator('[role="alert"]')).toHaveCount(0);
      const geometry = await canvas.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth, page: document.documentElement.clientWidth, pageScroll: document.documentElement.scrollWidth }));
      expect(geometry.width).toBeGreaterThan(0);
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
      expect(geometry.pageScroll).toBeLessThanOrEqual(geometry.page + 1);
      if (pattern.id === "questions") {
        const question = canvas.locator("summary").filter({ hasText: "Where should I start?" });
        await question.click();
        await expect(question.locator("..")).toHaveAttribute("open", "");
        await question.click();
        await expect(question.locator("..")).not.toHaveAttribute("open", "");
      }
      await canvas.screenshot({ path: info.outputPath(`${pack}-${pattern.id}-${width}.png`), animations: "disabled" });
      captured++;
      expect(errors).toEqual([]);
    }
  }
  expect(captured).toBe(32);
});
