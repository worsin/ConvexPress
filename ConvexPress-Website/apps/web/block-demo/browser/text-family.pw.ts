import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [1440, 390]) test(`text family content boundaries and semantics · ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "networkidle" });
  const study = page.locator("[data-text-family]");
  const canvas = study.locator("[data-text-family-canvas]");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await study.locator("summary").click();
    const sizes: number[] = [];
    for (const level of [1, 2, 3, 4, 5, 6]) {
      await study.getByLabel("Heading level").selectOption(String(level));
      await expect(canvas.getByRole("heading", { level, name: "A little space. A better story." })).toHaveAttribute("id", "family-heading-target");
      sizes.push(await canvas.getByRole("heading").evaluate(el => parseFloat(getComputedStyle(el).fontSize)));
    }
    expect(sizes[0]).toBeGreaterThan(sizes[1]!);
    expect(sizes[1]).toBeGreaterThan(sizes[2]!);
    expect(sizes[2]).toBeGreaterThan(sizes[3]!);
    const prose = canvas.locator('[data-block-id="family-paragraph"]');
    for (const [tag, label] of [["strong", "bold"], ["em", "italic"], ["s", "strike"], ["u", "underline"], ["code", "code"]]) await expect(prose.locator(tag)).toHaveText(label);
    await expect(prose.locator("br")).toHaveCount(1);
    await expect(prose.locator("p")).toHaveCount(3);
    const link = prose.getByRole("link", { name: "A considered link" });
    await expect(link).toHaveAttribute("href", "https://example.com/story");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("target", "_blank");
    await study.getByLabel("Text family alignment").focus();
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    for (const tone of ["default", "muted", "inverted", "accent"]) {
      await study.getByLabel("Text family tone").selectOption(tone);
      await expect(canvas.locator("[data-block-id]")).toHaveCount(4);
      for (const block of await canvas.locator("[data-block-id]").all()) await expect(block).toHaveAttribute("data-tone", tone);
    }
    for (const align of ["center", "start"]) {
      await study.getByLabel("Text family alignment").selectOption(align);
      expect(await prose.evaluate(el => getComputedStyle(el).textAlign)).toBe(align === "start" ? "start" : "center");
    }
    await study.getByLabel("Content sample").selectOption("maximum");
    await expect(canvas.getByRole("heading")).toHaveText("W".repeat(200));
    await expect(prose.locator("p")).toHaveText("W".repeat(20000));
    expect(await canvas.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await study.getByLabel("Content sample").selectOption("empty");
    await expect(canvas.getByRole("heading")).toHaveCount(0);
    await expect(canvas.locator("#family-heading-target")).toHaveCount(1);
    await expect(prose.locator("p")).toHaveCount(0);
    await expect(canvas.getByRole("separator")).toHaveCount(1);
    expect(await canvas.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    await study.getByLabel("Content sample").selectOption("editorial");
    await study.getByLabel("Heading level").selectOption("2");
    await study.getByLabel("Text family tone").selectOption("default");
    await canvas.screenshot({ path: info.outputPath(`${pack}-text-family-${width}.png`) });
  }
  expect(errors).toEqual([]);
});
