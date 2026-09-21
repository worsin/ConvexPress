import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const pack of ["core", "journal", "depot", "aster-house"]) for (const width of [1440, 390]) {
  test(`promoted studio services · ${pack} · ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/", { waitUntil: "networkidle" });
    await selectPackReady(page, pack);
    await page.locator("#canonical-block").selectOption("blocks/studio-services");
    const canvas = page.locator(".canonical-canvas");
    await expect(canvas).toHaveAttribute("data-canonical-block", "blocks/studio-services");
    await expect(canvas.locator("[data-block-id]")).toHaveCount(1);
    await expect(canvas).toContainText("Thoughtful from the start");
    for (const heading of ["Design", "Build", "Refine"]) await expect(canvas.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await canvas.scrollIntoViewIfNeeded();
    const geometry = await canvas.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth, page: document.documentElement.clientWidth, pageScroll: document.documentElement.scrollWidth }));
    expect(geometry.width).toBeGreaterThan(0);expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);expect(geometry.pageScroll).toBeLessThanOrEqual(geometry.page + 1);
    await canvas.screenshot({ path: info.outputPath(`studio-services-${pack}-${width}.png`), animations: "disabled" });
    expect(errors).toEqual([]);
  });
}
