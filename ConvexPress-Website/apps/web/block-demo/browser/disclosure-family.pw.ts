import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [1440, 390]) test(`disclosure family keyboard, content and bounds · ${width}`, async ({ page }, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "networkidle" });
  const study = page.locator("[data-disclosure-family]");
  const canvas = study.locator("[data-disclosure-family-canvas]");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await study.locator(":scope > summary").click();
    const accordion = canvas.locator('[data-block-id="family-accordion"]');
    await expect(accordion.locator("details[open] summary")).toHaveText("A useful ritual");
    const first = accordion.locator("summary").first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(accordion.locator("details[open]")).toHaveCount(2);
    await page.keyboard.press("Space");
    await expect(accordion.locator("details[open]")).toHaveCount(1);
    const faq = canvas.locator('[data-block-id="family-faq"]');
    await faq.locator("summary").first().click();
    await expect(faq.locator("details[open] > div")).toHaveCSS("white-space", "pre-line");
    for (const id of ["family-tabs", "family-feature-tabs", "family-tabbed-content"]) {
      const block = canvas.locator(`[data-block-id="${id}"]`);
      const tabs = block.getByRole("tab");
      for (const dir of ["ltr", "rtl"]) {
        await study.getByLabel("Reading direction").selectOption(dir);
        await tabs.first().focus();
        await page.keyboard.press("Home");
        await page.keyboard.press(dir === "rtl" ? "ArrowLeft" : "ArrowRight");
        await expect(tabs.nth(1)).toBeFocused();
        await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("End");
        await expect(tabs.last()).toBeFocused();
        await page.keyboard.press(dir === "rtl" ? "ArrowLeft" : "ArrowRight");
        await expect(tabs.first()).toBeFocused();
        const panel = block.getByRole("tabpanel");
        await expect(panel).toHaveAttribute("id", (await tabs.first().getAttribute("aria-controls"))!);
        await expect(panel).toHaveAttribute("aria-labelledby", (await tabs.first().getAttribute("id"))!);
        await page.keyboard.press("Tab");
        await expect(panel).toBeFocused();
      }
      if (id !== "family-tabs") await expect(block.getByRole("tabpanel").locator("img")).toHaveJSProperty("complete", true);
    }
    await study.getByLabel("Reading direction").selectOption("ltr");
    await canvas.screenshot({ path: info.outputPath(`${pack}-interactive-${width}.png`) });
    await study.getByLabel("Disclosure family sample").selectOption("maximum");
    await canvas.locator('details:not([open]) > summary').evaluateAll(nodes => nodes.forEach(node => (node as HTMLElement).click()));
    expect(await canvas.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    for (const list of await canvas.getByRole("tablist").all()) {
      const tab = list.getByRole("tab").first();
      expect(await tab.evaluate(el => el.getBoundingClientRect().width <= el.parentElement!.clientWidth + 1)).toBe(true);
      await tab.focus(); await page.keyboard.press("End");
      expect(await list.getByRole("tab").last().evaluate(el => { const a=el.getBoundingClientRect(), b=el.parentElement!.getBoundingClientRect(); return a.left >= b.left-1 && a.right <= b.right+1; })).toBe(true);
    }
    await study.getByLabel("Disclosure family sample").selectOption("empty");
    await expect(canvas.locator("details,[role=tab],[role=tabpanel]")).toHaveCount(0);
    await study.getByLabel("Disclosure family sample").selectOption("outside");
    await expect(accordion.locator("details[open]")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
