import { selectPackReady } from "./pack-ready";
import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) test(`image-filled layouts and maker marks · ${width}`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "aster-house", "journal", "depot"]) {
    await selectPackReady(page, pack);
    for (const name of ["core/image", "core/hero-split", "core/media-text", "core/logo-cloud"]) {
      await page.locator("#canonical-block").selectOption(name);
      await page.locator("#canonical-example").selectOption("2");
      await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
      const image = canvas.locator("img");
      await expect(image).toHaveCount(1);
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0)).toBe(true);
      const geometry = await image.evaluate(node => {
        if (!(node instanceof HTMLImageElement)) throw new Error("Expected a rendered image");
        return ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        alt: node.alt,
        src: node.currentSrc,
        });
      });
      expect(geometry.alt.trim().length).toBeGreaterThan(0);
      expect(geometry.height).toBeGreaterThan(30);
      expect(geometry.width).toBeGreaterThan(name === "core/logo-cloud" ? 50 : 200);
      if (name === "core/logo-cloud") {
        expect(geometry.src).toContain("aster-objects-compact.png");
        const logos = canvas.locator(".cp-library-logos");
        const bounds = await logos.evaluate(node => ({ width: node.getBoundingClientRect().width, parent: node.parentElement!.getBoundingClientRect().width }));
        expect(bounds.width).toBeGreaterThanOrEqual(bounds.parent - 1);
        await expect(logos.getByRole("link", { name: "Aster Objects" })).toHaveAttribute("href", "/makers/aster-objects");
        await expect(logos.getByText("Common Ground", { exact: true })).toBeVisible();
      }
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await canvas.screenshot({ path: info.outputPath(`${pack}-${name.replaceAll("/", "-")}-${width}.png`), animations: "disabled" });
    }
  }
});
