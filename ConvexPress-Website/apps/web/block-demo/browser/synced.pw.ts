import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) test(`Synced Content across four packs at ${width}px`, async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 1100 });
  const errors: string[] = [], outbound: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (new URL(request.url()).hostname === "block-demo.invalid") outbound.push(request.url()); });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#canonical-block").selectOption("core/synced");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await page.locator("#pack").selectOption(pack);
    const canvas = page.locator(".canonical-canvas"), scenario = canvas.getByLabel("Shared content preview");
    for (const composition of ["direct", "nested"]) {
    await canvas.getByLabel("Shared content composition").selectOption(composition);
    await scenario.selectOption("original");
    await expect(canvas.getByRole("heading", { name: "One idea. Everywhere." })).toHaveCount(2);
    await expect(canvas.locator(".cp-synced-content")).toHaveCount(composition === "nested" ? 3 : 2);
    const ids = await canvas.locator("[data-block-id]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-block-id")));
    expect(new Set(ids).size).toBe(ids.length);
    await scenario.selectOption("updated");
    await expect(canvas.getByRole("heading", { name: "Good things grow together." })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "One idea. Everywhere." })).toBeVisible();
    expect(await canvas.locator("[data-block-id]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-block-id")))).toEqual(ids);
    expect(await canvas.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
    const typography = await canvas.locator(".cp-heading").evaluateAll(headings => headings.map(heading => {
      const inline = heading.querySelector('.cp-rich-text[data-inline="true"]')!;
      return { heading: getComputedStyle(heading).lineHeight, inline: getComputedStyle(inline).lineHeight };
    }));
    for (const line of typography) expect(line.inline).toBe(line.heading);
    const widths = await canvas.locator(".cp-synced-content").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
    expect(widths.every(value => value > (width === 390 ? 200 : 600))).toBe(true);
    await canvas.screenshot({ path: info.outputPath(`${pack}-${composition}-${width}.png`), animations: "disabled" });
    await scenario.selectOption("restricted");
    await expect(canvas.getByRole("heading", { name: "One idea. Everywhere." })).toHaveCount(1);
    await scenario.selectOption("withdrawn");
    await expect(canvas.getByRole("status")).toHaveText(["Reusable content unavailable.", "Reusable content unavailable."]);
    await expect(canvas.getByRole("heading")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await scenario.selectOption("original");
    await expect(canvas.getByRole("heading", { name: "One idea. Everywhere." })).toHaveCount(2);
    await scenario.focus();await expect(scenario).toBeFocused();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    }
  }
  expect(errors).toEqual([]);expect(outbound).toEqual([]);
});
