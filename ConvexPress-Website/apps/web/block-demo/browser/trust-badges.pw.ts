import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("trust badge icon choices render in every pack and remain removable", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto("/?block=core%2Ftrust-badges&example=1", { waitUntil: "networkidle" });
  await page.getByText("Try local field edits", { exact: true }).click();
  const study = page.getByRole("region", { name: "Local block authoring preview" });
  const canvas = study.locator('[data-authoring-preview="canvas"]');
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await study.getByRole("button", { name: "Reset local draft", exact: true }).click();
    const icon = study.getByRole("combobox", { name: "Icon", exact: true }).first();
    const options = await icon.locator("option").allTextContents();
    expect(options).toHaveLength(14);
    for (const label of options.slice(1)) {
      await icon.selectOption({ label });
      await expect(canvas.locator(".cp-library-trust-badges > li").first().locator("svg")).toHaveAttribute("aria-hidden", "true");
      await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
    }
    await study.getByRole("button", { name: "Reset Icon", exact: true }).first().click();
    await expect(canvas.locator(".cp-library-trust-badges > li").first().locator("svg")).toHaveCount(0);
    const label = study.getByRole("textbox", { name: "Label", exact: true }).first();
    await label.fill("   ");
    await expect(label).toHaveAttribute("aria-invalid", "true");
    await label.fill("\u200b");
    await expect(label).toHaveAttribute("aria-invalid", "true");
    await label.fill("A".repeat(160));
    await expect(label).not.toHaveAttribute("aria-invalid", "true");
    const media = canvas.getByRole("img", { name: "Fictional Aster House studio mark", exact: true });
    await expect(media).toBeVisible();
    await expect.poll(() => media.evaluate(n => n instanceof HTMLImageElement && n.complete && n.naturalWidth > 0)).toBe(true);
    await expect(media).toHaveCSS("object-fit", "contain");
    await expect(media.locator("..")).toHaveAttribute("data-fit", "contain");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await canvas.evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
      await canvas.screenshot({ path: info.outputPath(`${pack}-${width}.png`) });
    }
  }
});
