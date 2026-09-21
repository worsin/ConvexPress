import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

const cases = [
  { name: "core/ugc-grid", item: ".cp-ugc-frame" },
  { name: "core/social-feed", item: ".cp-social-card" },
  { name: "core/search-results", item: ".cp-search-item" },
  { name: "commerce/download-library", item: ".cp-download-file" },
];

for (const specimen of cases) {
  test(`${specimen.name} waits for entry and settles for focus or reduced motion`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.addStyleTag({ content: ".canonical-canvas { margin-top: 2000px !important; }" });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const pack of ["core", "journal", "depot", "aster-house"]) {
        await page.locator("#canonical-block").selectOption("core/heading");
        await selectPackReady(page, pack);
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo({ top: 0, behavior: "instant" });
        });
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await page.locator("#canonical-block").selectOption(specimen.name);
        const item = page.locator(`.canonical-canvas ${specimen.item}`).first();
        await expect(item).toBeAttached();
        expect(await item.evaluate(node => node.getBoundingClientRect().top)).toBeGreaterThan(900);
        await expect(item).toHaveCSS("animation-name", "none");
        await expect(item).toHaveCSS("opacity", "1");
        await expect(item).toHaveAttribute("data-reveal", "pending");
        await item.scrollIntoViewIfNeeded();
        await expect(item).toHaveAttribute("data-reveal", "entered");
        expect(await item.evaluate(node => getComputedStyle(node).animationName)).not.toBe("none");
        // Focus must expose the complete control, even during its entrance.
        await item.locator("a[href],button:not(:disabled)").first().focus();
        await expect(item).toHaveAttribute("data-reveal", "settled");
        await expect(item).toHaveCSS("animation-name", "none");
        await expect(item).toHaveCSS("opacity", "1");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(page.locator(`.canonical-canvas ${specimen.item}`).last()).toHaveCSS("animation-name", "none");
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await expect(item).toHaveCSS("animation-name", "none");
      }
    }
  });
}

test("entrance cards remain visible without IntersectionObserver", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "IntersectionObserver", { value: undefined, configurable: true }); });
  await page.goto("/", { waitUntil: "networkidle" });
  for (const specimen of cases) {
    await page.locator("#canonical-block").selectOption(specimen.name);
    const item = page.locator(`.canonical-canvas ${specimen.item}`).first();
    await expect(item).toHaveCSS("opacity", "1");
    await expect(item).toHaveCSS("animation-name", "none");
    await expect(item.locator("a[href],button:not(:disabled)").first()).toBeEnabled();
  }
});
