import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("product grids respond to narrow and medium desktop columns", async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  await page.addStyleTag({ content: ".canonical-canvas { inline-size:var(--product-review-width); max-inline-size:100%; }" });
  for (const columnWidth of [420, 760]) {
  await canvas.evaluate((node, width) => (node as HTMLElement).style.setProperty("--product-review-width", `${width}px`), columnWidth);
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    for (const [block, example] of [["commerce/product-showcase", "0"], ["blocks/product-collection", "2"]]) {
      await page.locator("#canonical-block").selectOption(block);
      await page.locator("#canonical-example").selectOption(example);
      const cards = canvas.locator(".cp-collection-card");
      await expect(cards).toHaveCount(4);
      const first = await cards.nth(0).boundingBox(), second = await cards.nth(1).boundingBox();
      if (columnWidth === 420) expect(second!.y, `${pack}: ${block} must stack in a narrow column`).toBeGreaterThan(first!.y + first!.height - 1);
      else {
        expect(Math.abs(second!.y - first!.y), `${pack}: ${block} uses two medium columns`).toBeLessThan(1);
        const third = await cards.nth(2).boundingBox();
        expect(third!.y).toBeGreaterThan(first!.y + first!.height - 1);
      }
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await canvas.screenshot({ path: info.outputPath(`${pack}-${block.split("/")[1]}-${columnWidth}.png`), animations: "disabled" });
    }
  }
  }
});

for (const width of [1440, 390]) test(`product availability and cart failures across templates · ${width}`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    for (const [block, example] of [["commerce/product-showcase", "0"], ["blocks/product-collection", "2"]]) {
      await page.locator("#canonical-block").selectOption(block);
      await page.locator("#canonical-example").selectOption(example);
      const source = canvas.getByRole("combobox", { name: "Product source specimen" });
      await source.selectOption("example");
      const availability = canvas.getByRole("combobox", { name: "Product availability specimen" });
      const host = canvas.getByRole("combobox", { name: "Cart host specimen" });
      await availability.selectOption("instock");
      await host.selectOption("none");
      const first = canvas.locator(".cp-collection-card").first();
      await expect(first.getByRole("link", { name: /^View product/ })).toHaveAttribute("href", "/products/demo-product-mug");
      await host.selectOption("loading");
      const add = first.getByRole("button", { name: /^Add to cart/ });
      await expect(add).toBeDisabled();
      await host.selectOption("busy");
      await expect(add).toBeDisabled();
      await host.selectOption("failure");
      const calls = Number(await canvas.locator("[data-synthetic-cart-calls]").getAttribute("data-synthetic-cart-calls"));
      await add.click();
      await expect(first.getByRole("status")).toHaveText("Could not add this item. Please try again.");
      await expect(add).toBeEnabled();
      await host.selectOption("ready");
      await add.focus();
      await page.keyboard.press("Enter");
      await expect(first.getByRole("status")).toHaveText("Added to cart");
      await expect(canvas.locator("[data-synthetic-cart-calls]")).toHaveAttribute("data-synthetic-cart-calls", String(calls + 2));
      await expect(canvas.locator("[data-synthetic-cart-calls]")).toContainText("demo-product-mug");
      for (const [state, label] of Object.entries({ outofstock: "Out of stock", external: "Sold by a partner", options: "Availability varies by option", onbackorder: "Available on backorder", instock: "In stock" })) {
        await availability.selectOption(state);
        if (block === "commerce/product-showcase") await expect(canvas.locator(".cp-showcase-stock").first()).toHaveText(label);
        if (state === "options") await expect(first.getByRole("link", { name: /^Choose options/ })).toHaveAttribute("href", "/products/demo-product-mug");
        if (["outofstock", "external", "options"].includes(state)) await expect(first.getByRole("button")).toHaveCount(0);
        else await expect(add).toBeEnabled();
      }
      for (const image of await canvas.locator("img").all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(async node => (node as HTMLImageElement).decode());
        expect(await image.evaluate(node => getComputedStyle(node).transitionDuration)).toBe("0s");
      }
      expect(await canvas.locator(".cp-collection-card").evaluateAll(cards => cards.every(node => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
      await canvas.screenshot({ path: info.outputPath(`${pack}-${block.split("/")[1]}-purchase-${width}.png`), animations: "disabled" });
    }
  }
  await canvas.getByRole("combobox", { name: "Product availability specimen" }).selectOption("external");
  await page.locator("#canonical-block").selectOption("commerce/product-hero");
  await page.locator("#canonical-example").selectOption("0");
  await expect(canvas.getByRole("combobox", { name: "Product availability specimen" })).toHaveCount(0);
  await expect(canvas.getByRole("link", { name: /^View product/ })).toHaveAttribute("href", "/products/demo-product-notebook");
});

for (const width of [1440, 390]) test(`product sources, groups and carousel recovery · ${width}`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  const source = canvas.getByRole("combobox", { name: "Product source specimen" });
  const titles = canvas.locator(".cp-collection-card h3");
  const all = ["The morning mug", "Field notes, kept close", "A cup for company", "The open-page journal"];
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await page.locator("#canonical-block").selectOption("commerce/product-showcase");
    await page.locator("#canonical-example").selectOption("0");
    for (const [mode, expected] of Object.entries({ newest: all, category: [all[0], all[2]], sale: [all[1]], slugs: [all[1], all[0]] })) {
      await source.selectOption(mode);
      await expect(titles).toHaveText(expected);
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    await page.locator("#canonical-block").selectOption("blocks/product-collection");
    await page.locator("#canonical-example").selectOption("2");
    for (const [mode, expected] of Object.entries({ manual: all, category: [all[0], all[2]], tag: [all[1]], sale: [all[1]], featured: all.slice(0,2), recent: all, recentlyViewed: [all[3],all[0]], authored: ["The studio edition"] })) {
      await source.selectOption(mode);
      await expect(titles).toHaveText(expected);
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    await canvas.getByRole("tab", { name: "Kitchen", exact: true }).click();
    await expect(titles).toHaveText([all[0], all[2]]);
    await page.keyboard.press("ArrowRight");
    await expect(canvas.getByRole("tab", { name: "Studio edition", exact: true })).toBeFocused();
    await expect(titles).toHaveText(["The studio edition"]);
    await page.keyboard.press("End");
    await expect(titles).toHaveCount(0);
    await expect(canvas).not.toContainText("Must not replace unavailable products");
    await page.keyboard.press("Home");
    await expect(titles).toHaveText(["The studio edition"]);
    // A rail must remove its controls when its selected group becomes empty.
    await source.selectOption("manual");
    await canvas.getByRole("combobox", { name: "Collection layout" }).selectOption("carousel");
    const rail = canvas.locator(".cp-collection-grid");
    if (width === 390) {
      await expect(canvas.getByRole("button", { name: "Next products", exact: true })).toBeEnabled();
      await canvas.getByRole("button", { name: "Next products", exact: true }).click();
      await expect.poll(() => rail.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
      await canvas.getByRole("tab", { name: "Unavailable selection", exact: true }).click();
      await expect(titles).toHaveCount(0);
      await expect(canvas.locator(".cp-collection-controls")).toHaveCount(0);
      await canvas.getByRole("tab", { name: "All products", exact: true }).click();
      await expect(titles).toHaveText(all);
      await expect(canvas.getByRole("button", { name: "Previous products", exact: true })).toBeDisabled();
    }
    await canvas.getByRole("combobox", { name: "Collection layout" }).selectOption("grid");
    await source.selectOption("maximum");
    await expect(titles).toHaveText(["W".repeat(160)]);
    expect(await canvas.locator(".cp-collection-card").evaluateAll(cards => cards.every(node => node.scrollWidth <= node.clientWidth + 1)), `${pack}: text must stay inside its own card`).toBe(true);
    expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${pack}: maximum authored copy`).toBe(true);
    await canvas.screenshot({ path: info.outputPath(`${pack}-maximum-${width}.png`), animations: "disabled" });
  }
  expect(errors).toEqual([]);
});
