import { test, expect } from "@playwright/test";
const packs = { core: "Core", journal: "Journal", depot: "Depot", "aster-house": "Aster House" };
for (const width of [1440, 390]) test(`runtime composition across actual packs · ${width}`, async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/?pack=core#runtime-composition", { waitUntil: "networkidle" });
  const study = page.locator("#runtime-composition"), canvas = study.locator(".composition-study-canvas");
  const state = study.getByRole("combobox", { name: "Composition state" });
  let source: string | null = null;
  for (const [pack, label] of Object.entries(packs)) {
    await page.locator("#pack").selectOption(pack);
    await expect(page.locator(".theme-status strong")).toHaveText(label);
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]')].every(link => link.sheet !== null));
    await state.selectOption("ready");
    await expect(canvas.locator("img")).toHaveCount(3);
    for (const img of await canvas.locator("img").all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
    }
    await page.evaluate(() => document.fonts.ready);
    await expect(canvas.getByRole("heading", { name: "A little room for the everyday." })).toBeVisible();
    await expect(canvas.getByText("$38.00", { exact: true })).toBeVisible();
    const definition = await study.locator(".composition-study-source pre").textContent();
    if (source === null) source = definition; else expect(definition).toBe(source);
    const markers = await canvas.locator("[data-pack-primitive]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-pack-primitive")));
    expect(markers.every(value => value?.startsWith(`${pack}:`))).toBe(true);
    if (pack === "journal" || pack === "depot") expect(markers.length).toBeGreaterThan(0);
    expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await canvas.screenshot({ path: info.outputPath(`${pack}-ready-${width}.png`) });
    if (width === 390) await canvas.locator(".cp-card").first().screenshot({ path: info.outputPath(`${pack}-first-card-${width}.png`) });
    await state.selectOption("unavailable");
    await expect(canvas.locator("img")).toHaveCount(2);
    await expect(canvas.getByRole("heading", { name: "The morning mug" })).toHaveCount(0);
    await expect(canvas.getByText("$38.00", { exact: true })).toHaveCount(0);
    await state.selectOption("empty");
    await expect(canvas.locator("img")).toHaveCount(0);
    await expect(canvas.getByText("Nothing in this collection yet. Come back for the next edit.")).toBeVisible();
    await state.selectOption("unsafe");
    await expect(canvas.getByRole("alert")).toBeVisible();
    await expect(canvas.locator("img, a, .cp-p")).toHaveCount(0);
    await canvas.screenshot({ path: info.outputPath(`${pack}-rejected-${width}.png`) });
    await state.selectOption("ready");
    const link = canvas.getByRole("link", { name: "Explore The morning mug", exact: true });
    await link.focus(); await expect(link).toBeFocused();
    await link.press("Enter");
    await expect(page).toHaveURL(new RegExp(`pack=${pack}.*demoPage=product.*demoItem=demo-product-mug`));
    await expect(page.locator(".composed-canvas").getByRole("heading", { name: "The morning mug", exact: true, level: 1 })).toBeVisible();
    await page.goBack({ waitUntil: "networkidle" });
    await expect(study).toBeVisible();
  }
  expect(errors).toEqual([]);
});
