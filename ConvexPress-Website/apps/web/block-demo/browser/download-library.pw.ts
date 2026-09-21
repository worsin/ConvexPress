import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) test(`Download library across four packs at ${width}px`, async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 1100 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#canonical-block").selectOption("commerce/download-library");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await page.locator("#pack").selectOption(pack);
    const fixture = page.getByLabel("Synthetic downloads fixture"), canvas = page.locator(".canonical-canvas");
    await fixture.selectOption("ready");
    await expect(canvas.getByRole("heading", { name: "The field guide to slower mornings" })).toBeVisible();
    await expect(canvas.getByText("Access expired", { exact: true })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Download Notes from the coast", exact: true })).toHaveCount(0);
    expect(await canvas.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
    const download = canvas.getByRole("button", { name: "Download The field guide to slower mornings", exact: true });
    await download.focus(); await expect(download).toBeFocused(); await page.keyboard.press("Enter");
    await expect(canvas.getByRole("status")).toContainText("Download requested: slower-mornings-field-guide.pdf");
    await canvas.screenshot({ path: info.outputPath(`${pack}-${width}.png`), animations: "disabled" });
    await canvas.getByRole("button", { name: "Next →", exact: true }).click();
    await expect(canvas.getByText("Download limit reached", { exact: true })).toBeVisible();
    await canvas.getByRole("button", { name: "← Previous", exact: true }).click();
    await expect(download).toBeVisible();
    for (const [state, expected] of [["empty", "A place for your next discovery."], ["signed-out", "Everything you’ve collected, in one place."], ["loading", "Loading your downloads…"], ["offline", "Reconnect to see your downloads."], ["unavailable", "Your downloads are unavailable right now."]]) {
      await fixture.selectOption(state!);
      await expect(canvas).toContainText(expected!);
      await expect(canvas.locator(".cp-download-list")).toHaveCount(0);
    }
    await page.emulateMedia({ reducedMotion: "reduce" }); await fixture.selectOption("ready");
    expect(await canvas.locator(".cp-download-file").first().evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  expect(errors).toEqual([]);
});
