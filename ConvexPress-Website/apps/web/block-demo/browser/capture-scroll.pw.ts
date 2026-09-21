import { selectPackReady } from "./pack-ready";
import { test, expect } from "@playwright/test";
import { decodeCaptureMedia } from "./capture-media";

for (const width of [1440, 390]) test(`media capture preserves the reader's scroll position · ${width}`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "aster-house", "journal", "depot"]) {
    await selectPackReady(page, pack);
    for (const [name, example, selector] of [
      ["core/marquee", "1", ".cp-library-rich-marquee-window"],
      ["commerce/product-compare", "0", '[aria-label="Product comparison"]'],
    ]) {
      await page.locator("#canonical-block").selectOption(name);
      await page.locator("#canonical-example").selectOption(example);
      const region = canvas.locator(selector);
      await expect(region).toBeVisible();
      await region.scrollIntoViewIfNeeded();
      for (const requested of [0, 83]) {
        const before = await region.evaluate((node, value) => { node.scrollLeft = value; return node.scrollLeft; }, requested);
        await decodeCaptureMedia(canvas);
        expect(await region.evaluate(node => node.scrollLeft)).toBe(before);
      }
      await region.evaluate(node => { node.scrollLeft = 0; });
      await decodeCaptureMedia(canvas);
      expect(await region.evaluate(node => node.scrollLeft)).toBe(0);
      await canvas.screenshot({ path: info.outputPath(`${pack}-${name.replaceAll("/", "-")}-${width}.png`), animations: "disabled" });
    }
  }
});
