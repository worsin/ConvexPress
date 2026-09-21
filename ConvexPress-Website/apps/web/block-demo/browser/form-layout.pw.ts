import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("Depot embedded form keeps words whole and fields usable in its available column", async ({ page }, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await selectPackReady(page, "depot");
  await page.locator("#canonical-block").selectOption("core/form");
  await page.locator("#canonical-example").selectOption("1");
  const canvas = page.locator(".canonical-canvas");
  const form = canvas.locator(".depot-form");
  await expect(form).toBeVisible();
  for (const width of [1296, 800, 600, 320]) {
    await canvas.evaluate((node, width) => { (node as HTMLElement).style.width = `${width}px`; }, width);
    await page.evaluate(() => document.fonts.ready);
    const heading = form.getByRole("heading").first();
    const broken = await heading.evaluate(element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), words: string[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of node.textContent!.matchAll(/\S+/gu)) {
          const range = document.createRange(); range.setStart(node, match.index!); range.setEnd(node, match.index! + match[0].length);
          if (new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size > 1) words.push(match[0]);
        }
      }
      return words;
    });
    await canvas.screenshot({ path: info.outputPath(`depot-form-${width}.png`), animations: "disabled" });
    expect(broken, `Ordinary heading words split at ${width}px`).toEqual([]);
    expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    for (const field of await form.locator('input:not([type="hidden"]), textarea, select').all())
      expect(await field.evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(170);
    const geometry = await form.evaluate(node => {
      const intro = node.querySelector('.cp-split > :first-child')!.getBoundingClientRect(), fields = node.querySelector('.depot-form-fields')!.getBoundingClientRect();
      return { available: node.clientWidth, introBottom: intro.bottom, fieldsTop: fields.top, fieldsLeft: fields.left, introRight: intro.right };
    });
    if (geometry.available < 832) expect(geometry.fieldsTop).toBeGreaterThan(geometry.introBottom);
    else expect(geometry.fieldsLeft).toBeGreaterThan(geometry.introRight);
  }
});
