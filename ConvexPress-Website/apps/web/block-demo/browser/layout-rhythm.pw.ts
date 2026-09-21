import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [1440, 390])
  test(`template spacing and action hierarchy · ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/?demoPage=studio&pack=core#composed-pages", { waitUntil: "networkidle" });
    const canvas = page.locator(".composed-canvas");
    const original = await page.locator(".composed-source pre").textContent();
    const metrics: Record<string, {padding: number; gap: number; width: number}> = {};
    for (const pack of ["core", "journal", "depot", "aster-house"]) {
      await selectPackReady(page, pack);
      await expect(canvas.locator('[data-composed-ready="true"]')).toHaveCount(1);
      const hero = canvas.locator('.composed-content .cp-section[data-block-id]').first();
      const primary = hero.getByRole("link", { name: "Meet the collection", exact: true });
      const secondary = hero.getByRole("link", { name: "Our field notes", exact: true });
      await expect(primary).toHaveAttribute("data-variant", "primary");
      await expect(secondary).toHaveAttribute("data-variant", "outline");
      await primary.focus();
      await page.keyboard.press("Tab");
      await expect(secondary).toBeFocused();
      expect(await secondary.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(await primary.evaluate(el => getComputedStyle(el).backgroundColor));
      const row = secondary.locator("..");
      expect(await row.evaluate(el => getComputedStyle(el).flexWrap)).toBe("wrap");
      metrics[pack] = await hero.evaluate(el => ({
        padding: parseFloat(getComputedStyle(el).paddingBlockStart),
        gap: parseFloat(getComputedStyle(el).getPropertyValue("--stack-gap-md")),
        width: el.getBoundingClientRect().width,
      }));
      expect(await canvas.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      const source = await page.locator(".composed-source pre").textContent();
      const normalize = (s: string | null) => s?.replace(/pack=[^&#"\s]+/gu, "pack=TEMPLATE");
      expect(normalize(source)).toBe(normalize(original));
      for (const image of await canvas.locator('img').all()) await image.evaluate(async image => { await (image as HTMLImageElement).decode(); });
      await canvas.screenshot({path: info.outputPath(`${pack}-studio.png`), animations: "disabled"});
    }
    expect(metrics.depot.padding).toBeLessThan(metrics.core.padding);
    expect(metrics.depot.gap).toBeLessThan(metrics.journal.gap);
    expect(errors).toEqual([]);
    await info.attach('layout-metrics', {body:JSON.stringify(metrics,null,2),contentType:'application/json'});
  });
