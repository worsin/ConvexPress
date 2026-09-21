import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [1440, 390]) test(`editorial family fields and reading layout · ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "networkidle" });
  const study = page.locator("[data-content-family]");
  const canvas = study.locator("[data-content-family-canvas]");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await study.locator("summary").click();
    const list = canvas.locator('[data-block-id="content-list"] .cp-block-list');
    for (const [style, tag, marker] of [["bullet", "UL", "disc"], ["ordered", "OL", "decimal"], ["task", "UL", "none"]]) {
      await study.getByLabel("List presentation").selectOption(style!);
      expect(await list.evaluate(el => el.tagName)).toBe(tag);
      expect(await list.evaluate(el => getComputedStyle(el).listStyleType)).toBe(marker);
      await expect(list.locator("li")).toHaveCount(3);
    }
    await expect(list.getByRole("img", { name: "Completed", exact: true })).toHaveCount(1);
    await expect(list.getByRole("img", { name: "Not completed", exact: true })).toHaveCount(2);
    const source = canvas.getByRole("link", { name: "View source", exact: true });
    await expect(source).toHaveAttribute("href", "https://example.com/notebook");
    await study.getByLabel("Callout kind").focus();
    await page.keyboard.press("Tab");
    await expect(source).toBeFocused();
    await expect(canvas.locator("dl dt")).toHaveCount(2);
    await expect(canvas.locator("dl dd")).toHaveCount(2);
    for (const kind of ["note", "tip", "important", "warning"]) {
      await study.getByLabel("Callout kind").selectOption(kind);
      await expect(canvas.getByRole("complementary", { name: "Leave room for a surprise" }).locator(".cp-eyebrow")).toHaveText(kind);
    }
    const code = canvas.locator("pre code");
    await expect(code.locator(".hljs-keyword").first()).toBeVisible();
    await expect(code).toContainText("place: 'The workroom'");
    await study.getByLabel("Content family sample").selectOption("unknown");
    await expect(code.locator("span")).toHaveCount(0);
    await study.getByLabel("Content family sample").selectOption("maximum");
    expect(await canvas.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const region = canvas.getByRole("region", { name: /^Code:/ });
    await region.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await study.getByLabel("Content family sample").selectOption("empty");
    await expect(canvas.locator("blockquote,dt,dd,li")).toHaveCount(0);
    await expect(code).toHaveText("");
    await study.getByLabel("Content family sample").selectOption("editorial");
    await study.getByLabel("List presentation").selectOption("bullet");
    await study.getByLabel("Callout kind").selectOption("note");
    expect(await canvas.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await region.evaluate(el => { el.scrollLeft = 0; (el as HTMLElement).blur(); });
    await canvas.screenshot({ path: info.outputPath(`${pack}-editorial-${width}.png`) });
  }
  expect(errors).toEqual([]);
});
