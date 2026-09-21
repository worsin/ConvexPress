import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

const names = ["blocks/page-banner", "blocks/promo-band", "blocks/media-mentions", "blocks/story-timeline", "local/sample-alert", "commerce/assistant-band", "blocks/product-collection", "commerce/category-tiles", "commerce/product-showcase"];
for (const width of [1440, 390]) test(`action family destinations and label bounds · ${width}`, async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "networkidle" });
  const study = page.locator("[data-action-family]"), canvas = study.locator("[data-action-family-canvas]");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await study.locator(":scope > summary").click();
    for (const name of names) {
      await study.getByLabel("Action family block").selectOption(name);
      await study.getByLabel("Action family sample").selectOption("editorial");
      await expect(canvas.locator("[data-block-id]")).toHaveCount(1);
      await expect(canvas.locator('[data-demo-ready="false"]')).toHaveCount(0);
      const actions = canvas.locator('a[href="#action-destination"]');
      expect(await actions.count(), name).toBeGreaterThan(0);
      if (name === "blocks/promo-band") {
        await expect(actions.first()).toHaveAttribute("data-variant", "primary");
        await expect(actions.last()).toHaveAttribute("data-variant", "secondary");
      }
      for (const action of await actions.all()) {
        expect((await action.innerText()).trim().length).toBeGreaterThan(0);
        await action.focus(); await expect(action).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/#action-destination$/);
        await expect(study.locator("#action-destination")).toBeInViewport();
        await page.evaluate(() => history.replaceState(history.state, "", location.pathname + location.search));
      }
      for (const image of await canvas.locator("img").all()) {
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      await canvas.screenshot({ path: info.outputPath(`${pack}-${name.replaceAll("/", "-")}-${width}.png`), animations: "disabled" });
      await study.getByLabel("Action family sample").selectOption("maximum");
      await expect(canvas.locator('[data-demo-ready="false"]')).toHaveCount(0);
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${pack} ${name} maximum labels`).toBe(true);
      for (const action of await canvas.locator('a[href="#action-destination"]').all())
        expect(await action.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${name} action text fits`).toBe(true);
      for (const sample of ["text-only", "no-actions", "empty"]) {
        await study.getByLabel("Action family sample").selectOption(sample);
        await expect(canvas.locator('[data-demo-ready="false"]')).toHaveCount(0);
        await expect(canvas.locator('a[href="#action-destination"]')).toHaveCount(0);
      }
    }
  }
  expect(errors).toEqual([]);
});
