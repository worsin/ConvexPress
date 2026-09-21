import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const block of ["columns", "grid", "split", "sticky-aside"]) {
  test(`${block} stacks according to its authored content width`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/", { waitUntil: "networkidle" });
    const canvas = page.locator(".canonical-canvas");
    for (const pack of ["core", "journal", "depot", "aster-house"]) {
      await selectPackReady(page, pack);
      await page.locator("#canonical-block").selectOption(`core/${block}`);
      for (const width of [420, 900, 1280]) {
        await canvas.evaluate((node, width) => { node.style.width = `${width}px`; node.style.maxWidth = "none"; node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute("data-width", "full"); }, width);
        const layout = canvas.locator(block === "split" ? ".cp-split" : block === "sticky-aside" ? ".cp-sticky-layout" : ".cp-grid").first();
        const columns = await layout.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
        const expected = width === 420 || (block === "sticky-aside" && width === 900) ? 1 : block === "grid" && width === 1280 ? 3 : 2;
        expect(columns, `${pack}/${block}/${width}`).toBe(expected);
        expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        if (block === "sticky-aside") {
          await expect(canvas.locator(".cp-sticky-complement")).toHaveCSS("position", width === 1280 ? "sticky" : "static");
        }
        await canvas.screenshot({ path: info.outputPath(`${pack}-${block}-${width}.png`) });
      }
    }
  });
}

test("Section adds no second page gutter around its children", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await page.locator("#canonical-block").selectOption("core/section");
    const metrics = await canvas.evaluate(node => {
      const outer = node.querySelector('.cp-section[data-nested="false"] > .cp-container')!;
      const style = getComputedStyle(outer);
      const child = node.querySelector('.cp-section[data-nested="true"]')!;
      return { available: outer.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), child: child.getBoundingClientRect().width };
    });
    expect(Math.abs(metrics.available - metrics.child), `${pack}: nested section fills authored area`).toBeLessThanOrEqual(1);
  }
});


test("Sticky Aside remains in normal flow in a short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 480 });
  await page.goto("/?block=core%2Fsticky-aside&pack=core", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    const aside = canvas.locator(".cp-sticky-complement");
    await expect(aside).toHaveCSS("position", "static");
    await expect(aside).toHaveCSS("max-height", "none");
    expect(await canvas.locator(".cp-sticky-layout").evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length)).toBe(1);
  }
});
