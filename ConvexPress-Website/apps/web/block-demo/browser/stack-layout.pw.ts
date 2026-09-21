import { selectPackReady } from "./pack-ready";
import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) test(`stacked comparison and FAQ retain usable width · ${width}`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "aster-house", "journal", "depot"]) {
    await selectPackReady(page, pack);
    await page.locator("#canonical-block").selectOption("core/before-after");
    await page.locator("#canonical-example").selectOption("1");
    const comparison = canvas.locator(".cp-library-comparison");
    await comparison.scrollIntoViewIfNeeded();
    const geometry = await comparison.evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, parent: node.parentElement!.getBoundingClientRect().width }));
    expect(geometry.width).toBeGreaterThanOrEqual(geometry.parent - 1);
    expect(geometry.height).toBeGreaterThan(100);
    expect(Math.abs(geometry.width / geometry.height - 1.5)).toBeLessThan(0.03);
    for (const image of await comparison.locator("img").all()) {
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
    }
    const sources = await comparison.locator("img").evaluateAll(images => images.map(image => (image as HTMLImageElement).currentSrc));
    expect(new Set(sources).size).toBe(2);
    expect(sources[1]).toContain("ceramic-workshop-terracotta-after.png");
    const slider = canvas.getByRole("slider");
    expect(await slider.evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(geometry.width - 1);
    await slider.focus();await page.keyboard.press("Home");await expect(slider).toHaveValue("0");
    await expect(comparison.locator(".cp-library-comparison-after")).toHaveCSS("clip-path", "inset(0px 0px 0px 0%)");
    await comparison.screenshot({ path: info.outputPath(`${pack}-comparison-after-${width}.png`) });
    await page.keyboard.press("End");await expect(slider).toHaveValue("100");
    await expect(comparison.locator(".cp-library-comparison-after")).toHaveCSS("clip-path", "inset(0px 0px 0px 100%)");
    await comparison.screenshot({ path: info.outputPath(`${pack}-comparison-before-${width}.png`) });
    await page.keyboard.press("Home");await page.keyboard.press("ArrowRight");await expect(slider).toHaveValue("1");
    await canvas.screenshot({ path: info.outputPath(`${pack}-comparison-${width}.png`), animations: "disabled" });
    await page.locator("#canonical-block").selectOption("core/faq");
    await page.locator("#canonical-example").selectOption("1");
    const first = canvas.locator("summary").first();
    await first.scrollIntoViewIfNeeded();
    if (pack === "core" || pack === "aster-house") {
      const accordion = canvas.locator(".cp-accordion");
      const dimensions = await accordion.evaluate(node => ({ width: node.getBoundingClientRect().width, parent: node.parentElement!.getBoundingClientRect().width }));
      expect(dimensions.width).toBeGreaterThanOrEqual(dimensions.parent - 1);
    }
    await first.focus();await page.keyboard.press("Enter");await expect(first.locator("..")).toHaveAttribute("open", "");
    await page.keyboard.press("Space");await expect(first.locator("..")).not.toHaveAttribute("open", "");
    expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await canvas.screenshot({ path: info.outputPath(`${pack}-faq-${width}.png`), animations: "disabled" });
  }
});
