import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { selectPackReady } from "./pack-ready";

for (const width of [1440, 390]) test(`formatted text and keyboard tabs · ${width}`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  const evidence: unknown[] = [];
  for (const pack of ["core", "aster-house", "journal", "depot"]) {
    await selectPackReady(page, pack);
    await page.locator("#canonical-block").selectOption("core/rich-text");
    await page.locator("#canonical-example").selectOption("2");
    await expect(canvas.locator("strong")).toHaveText("Start with something ordinary.");
    await expect(canvas.locator("em")).toHaveText("Write a little. Leave some room.");
    await expect(canvas.locator("em")).toHaveCSS("font-style", "italic");
    await expect(canvas.locator("br")).toHaveCount(1);
    const link = canvas.getByRole("link", { name: "Explore the field notes" });
    await expect(link).toHaveAttribute("href", "/journal");
    await link.focus();
    await expect(link).toBeFocused();
    await canvas.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    evidence.push({ pack, width, emphasis: await canvas.locator("em").evaluate(node => {
      const style = getComputedStyle(node);
      return { fontFamily: style.fontFamily, fontStyle: style.fontStyle, fontSynthesis: style.fontSynthesis };
    }) });
    await canvas.screenshot({ path: info.outputPath(`${pack}-rich-text-${width}.png`), animations: "disabled" });
    expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);

    await page.locator("#canonical-block").selectOption("core/tabs");
    await page.locator("#canonical-example").selectOption("2");
    const tabs = canvas.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await tabs.nth(0).focus();
    for (const [key, index] of [["ArrowRight", 1], ["End", 2], ["ArrowRight", 0], ["ArrowLeft", 2], ["Home", 0]] as const) {
      await page.keyboard.press(key);
      await expect(tabs.nth(index)).toBeFocused();
      await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true");
      await expect(canvas.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
      const panel = canvas.getByRole("tabpanel");
      await expect(panel).toHaveCount(1);
      await expect(panel).toHaveAttribute("id", (await tabs.nth(index).getAttribute("aria-controls"))!);
      await expect(panel).toHaveAttribute("aria-labelledby", (await tabs.nth(index).getAttribute("id"))!);
    }
    for (let index = 0; index < 3; index++) {
      await tabs.nth(index).click();
      await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true");
      await canvas.screenshot({ path: info.outputPath(`${pack}-tabs-${index + 1}-${width}.png`), animations: "disabled" });
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
  }
  await writeFile(info.outputPath("text-evidence.json"), JSON.stringify(evidence, null, 2));
});
