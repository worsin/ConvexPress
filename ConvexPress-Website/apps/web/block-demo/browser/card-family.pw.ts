import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("card introduction fields preserve authored paragraph breaks", async ({ page }) => {
  await page.goto("/?block=core%2Ffeature-grid&example=1", { waitUntil: "networkidle" });
  await page.getByText("Try local field edits", { exact: true }).click();
  const study = page.getByRole("region", { name: "Local block authoring preview" });
  for (const name of ["core/feature-grid", "core/pricing-cards", "core/bento-grid", "core/feature-list-alternating"]) {
    await page.locator("#canonical-block").selectOption(name);
    const body = study.getByRole("textbox", { name: "Body", exact: true }).first();
    await expect(body).toHaveJSProperty("tagName", "TEXTAREA");
    await body.fill("A considered beginning.\n\nRoom for the details.");
    await expect(body).toHaveValue("A considered beginning.\n\nRoom for the details.");
    const canvas = study.locator('[data-authoring-preview="canvas"]');
    await expect(canvas.getByText("A considered beginning.", { exact: true })).toBeVisible();
    await expect(canvas.getByText("Room for the details.", { exact: true })).toBeVisible();
  }
});

test("feature grids fill the available width as cards are removed", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?block=core%2Ffeature-grid&example=1", { waitUntil: "networkidle" });
  await page.getByText("Try local field edits", { exact: true }).click();
  const study = page.getByRole("region", { name: "Local block authoring preview" });
  const canvas = study.locator('[data-authoring-preview="canvas"]');
  const form = study.getByRole("form", { name: "Feature Grid content", exact: true });
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await study.getByRole("button", { name: "Reset local draft", exact: true }).click();
    await canvas.evaluate(node => { node.style.width = "1280px"; node.style.maxWidth = "none"; node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute("data-width", "full"); });
    for (const count of [2, 1]) {
      await form.getByRole("button", { name: `Remove Items ${count + 1}`, exact: true }).click();
      const grid = canvas.locator(".cp-grid").first();
      await expect(grid.locator(":scope > *")).toHaveCount(count);
      await canvas.evaluate(node => node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute("data-width", "full"));
      const sizes = await grid.evaluate(node => {
        const bounds = node.getBoundingClientRect();
        const children = Array.from(node.children).map(child => child.getBoundingClientRect());
        return { available: bounds.width, filled: children.at(-1)!.right - children[0].left };
      });
      expect(Math.abs(sizes.available - sizes.filled), `${pack}: ${count} cards fill their row`).toBeLessThanOrEqual(1);
      await canvas.screenshot({ path: info.outputPath(`${pack}-features-${count}.png`) });
    }
  }
});

test("alternating media responds to its authored container and keeps source order", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?block=core%2Ffeature-list-alternating&example=2", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    for (const width of [420, 1104]) {
      await canvas.evaluate((node, width) => { node.style.width = `${width}px`; node.style.maxWidth = "none"; node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute("data-width", "full"); }, width);
      const rows = canvas.locator(".cp-library-alternating article");
      await expect(rows).toHaveCount(2);
      const columns = await rows.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).gridTemplateColumns.split(" ").length));
      expect(columns, `${pack}/${width}`).toEqual([width === 420 ? 1 : 2, width === 420 ? 1 : 2]);
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await expect(canvas.getByRole("img").first()).toHaveAttribute("alt", "A dark green ceramic mug on a stone windowsill beside folded linen");
      await canvas.screenshot({ path: info.outputPath(`${pack}-alternating-${width}.png`) });
    }
  }
});
