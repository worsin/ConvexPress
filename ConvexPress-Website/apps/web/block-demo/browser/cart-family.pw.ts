import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("basket summary fits its authored column across states and templates", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  await page.addStyleTag({ content: ".canonical-canvas { inline-size:var(--cart-review-width); max-inline-size:100%; }" });
  for (const width of [420, 760, 1200]) {
    await canvas.evaluate((node, value) => (node as HTMLElement).style.setProperty("--cart-review-width", `${value}px`), width);
    for (const pack of ["core", "journal", "depot", "aster-house"]) {
      await selectPackReady(page, pack);
      await page.locator("#canonical-block").selectOption("commerce/cart-cta");
      await page.locator("#canonical-example").selectOption("2");
      const fixture = canvas.getByRole("combobox", { name: "Synthetic basket fixture" });
      for (const state of ["ready", "large", "payment-pending", "empty", "loading", "unavailable", "ready"]) {
        await fixture.selectOption(state);
        const block = canvas.locator(".cp-cart-cta");
        await expect(block).toHaveAttribute("data-cart-state", state === "large" ? "ready" : state);
        const intro = await block.locator(".cp-cart-cta-intro").boundingBox();
        const actions = await block.locator(".cp-cart-cta-actions").boundingBox();
        if (width < 800) expect(actions!.y, `${pack}/${state}/${width}: actions stack below copy`).toBeGreaterThanOrEqual(intro!.y + intro!.height);
        else expect(actions!.x).toBeGreaterThan(intro!.x + intro!.width - 1);
        for (const element of await block.locator(".cp-cart-cta-intro, .cp-cart-cta-total, .cp-cart-cta-actions, a, dd").all()) {
          expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${pack}/${state}/${width}: content fits its own box`).toBe(true);
        }
        const checkout = block.getByRole("link", { name: "Continue to checkout", exact: true });
        await expect(checkout).toHaveCount(state === "ready" || state === "large" ? 1 : 0);
        const link = block.getByRole("link").first();
        await link.focus(); await expect(link).toBeFocused();
        if (state === "loading" || state === "empty" || state === "unavailable") await expect(block.locator(".cp-cart-cta-total")).toHaveCount(0);
        if (state === "large" || state === "empty") await block.screenshot({ path: info.outputPath(`${pack}-${width}-${state}.png`), animations: "disabled" });
      }
    }
  }
});
