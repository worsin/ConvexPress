import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) test(`poll preview and response states across four packs at ${width}px`, async ({ page }, info) => {
  test.setTimeout(120000); await page.setViewportSize({ width, height: 1050 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "networkidle" });
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await page.locator("#pack").selectOption(pack); await page.locator("#canonical-block").selectOption("core/poll"); await page.locator("#canonical-example").selectOption("1");
    const canvas = page.locator(".canonical-canvas");
    await expect(canvas.locator('[data-demo-ready="true"]')).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "How would you spend a slower morning?" })).toBeVisible();
    for (const input of await canvas.getByRole("radio").all()) await expect(input).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Send my response" })).toBeDisabled();
    await canvas.scrollIntoViewIfNeeded(); await page.evaluate(() => document.fonts.ready);
    await canvas.screenshot({ path: info.outputPath(`${pack}-${width}-preview.png`), animations: "disabled" });
    await canvas.getByRole("button", { name: "Try interactive demo" }).click();
    await canvas.getByRole("button", { name: "Send my response" }).click();
    await expect(canvas.getByRole("alert")).toBeFocused();
    await expect(canvas.getByRole("alert")).toContainText("Choose one option");
    const choice = canvas.getByRole("radio", { name: /A walk with no destination/ });
    await choice.focus(); await page.keyboard.press("Space"); await expect(choice).toBeChecked();
    await canvas.getByLabel("Simulate a failed submission").check();
    await canvas.getByRole("button", { name: "Send my response" }).click();
    await expect(canvas.getByRole("button", { name: "Saving response…" })).toBeDisabled();
    await expect(canvas.getByRole("alert")).toContainText("could not be saved");
    await expect(canvas.getByRole("alert")).toBeFocused();
    await canvas.screenshot({ path: info.outputPath(`${pack}-${width}-error.png`), animations: "disabled" });
    await canvas.getByLabel("Simulate a failed submission").uncheck();
    await canvas.getByRole("button", { name: "Send my response" }).click();
    await expect(canvas.getByRole("status")).toContainText("Thank you");
    await expect(canvas.getByRole("status")).toBeFocused();
    await expect(canvas.getByRole("button", { name: "Response recorded" })).toBeDisabled();
    await expect(canvas.locator(".cp-poll-footer")).toContainText("121 responses");
    await canvas.screenshot({ path: info.outputPath(`${pack}-${width}-success.png`), animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await canvas.locator(".cp-poll-fill").first().evaluate(node => getComputedStyle(node).transitionDuration)).toBe("0s");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await canvas.getByRole("button", { name: "Show read-only preview" }).click();
  }
  expect(errors).toEqual([]);
});
test("poll handles narrow columns, hidden results and signed-in policy without fabricated interaction", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1050 }); await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#canonical-block").selectOption("core/poll");
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await page.locator("#pack").selectOption(pack); await page.locator("#canonical-example").selectOption("1");
    await canvas.evaluate(node => { (node as HTMLElement).style.width = "300px"; });
    await expect(canvas.locator('[data-demo-ready="true"]')).toBeVisible();
    expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await canvas.screenshot({ path: info.outputPath(`${pack}-column-300.png`), animations: "disabled" });
  }
  await canvas.evaluate(node => { (node as HTMLElement).style.width = "550px"; });
  await page.locator("#canonical-example").selectOption("2"); await canvas.getByRole("button", { name: "Try interactive demo" }).click();
  await expect(canvas.getByRole("status")).toHaveText("Sign in to share your response.");
  await expect(canvas.getByRole("button", { name: "Send my response" })).toBeDisabled();
  await expect(canvas.locator(".cp-poll-percent")).toHaveCount(0);
});
