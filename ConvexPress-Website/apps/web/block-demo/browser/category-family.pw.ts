import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("category tiles respond to their column width inside a desktop page", async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  await page.addStyleTag({ content: ".canonical-canvas { inline-size:420px; max-inline-size:100%; }" });
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await page.locator("#canonical-block").selectOption("commerce/category-tiles");
    await page.locator("#canonical-example").selectOption("1");
    const tiles = canvas.locator(".cp-category-tile");
    await expect(tiles).toHaveCount(3);
    const first = await tiles.nth(0).boundingBox(), second = await tiles.nth(1).boundingBox();
    expect(first).not.toBeNull(); expect(second).not.toBeNull();
    expect(second!.y, `${pack}: narrow columns must stack category cards`).toBeGreaterThan(first!.y + first!.height - 1);
    expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await canvas.screenshot({ path: info.outputPath(`${pack}-narrow-column.png`), animations: "disabled" });
  }
});

for (const width of [1440, 390]) test(`category states and maximum content across templates · ${width}`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await page.locator("#canonical-block").selectOption("commerce/category-tiles");
    await page.locator("#canonical-example").selectOption("1");
    const specimen = canvas.getByRole("combobox", { name: "Category specimen" });
    for (const state of ["available", "discovering", "counting", "empty", "maximum", "available"]) {
      await specimen.selectOption(state);
      const expected = ["available", "maximum"].includes(state) ? "ready" : state;
      await expect(canvas.locator("[data-category-state]")).toHaveAttribute("data-category-state", expected);
      await expect(canvas.locator("[data-category-state]")).toHaveAttribute("aria-busy", ["discovering", "counting"].includes(state) ? "true" : "false");
      const tiles = canvas.locator(".cp-category-tile");
      await expect(tiles).toHaveCount(["discovering", "empty"].includes(state) ? 0 : 3);
      if (state === "counting") await expect(tiles.locator(".cp-category-count")).toHaveCount(0);
      if (state === "discovering") await expect(canvas.getByRole("status")).toHaveText("Finding your collections…");
      if (state === "counting") await expect(canvas.getByRole("status")).toHaveText("Updating product counts…");
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${pack}: ${state}`).toBe(true);
      if (state === "maximum") continue;
      for (const image of await canvas.locator("img").all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(async node => (node as HTMLImageElement).decode());
      }
      if (state === "available") {
        await tiles.first().focus(); await expect(tiles.first()).toBeFocused();
        await expect(tiles.first()).toHaveAttribute("href", "/categories/home");
        await expect(tiles.nth(2).locator(".cp-category-monogram")).toHaveText("T");
        await expect(tiles.locator(".cp-category-count")).toHaveText(["12 products", "8 products", "0 products"]);
        expect(await canvas.locator(".cp-category-arrow").first().evaluate(node => getComputedStyle(node).transitionDuration)).toBe("0s");
      }
      await canvas.screenshot({ path: info.outputPath(`${pack}-${state}-${width}.png`), animations: "disabled" });
    }
  }
  expect(errors).toEqual([]);
});
