import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("feature icon and link controls are optional, safe and rendered by every pack", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?block=core%2Ffeature-grid&example=1", { waitUntil: "networkidle" });
  await page.getByText("Try local field edits", { exact: true }).click();
  const study = page.getByRole("region", { name: "Local block authoring preview" });
  const canvas = study.locator('[data-authoring-preview="canvas"]');
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await study.getByRole("button", { name: "Reset local draft", exact: true }).click();
    const icons = study.getByRole("combobox", { name: "Icon", exact: true });
    await expect(icons).toHaveCount(3);
    await expect(icons.first().getByRole("option")).toHaveCount(14);
    await icons.first().selectOption({ label: "heart" });
    await expect(canvas.locator("svg.lucide-heart")).toHaveCount(1);
    await expect(canvas.locator("svg.lucide-heart")).toHaveAttribute("aria-hidden", "true");
    const label = study.getByRole("textbox", { name: "Link label", exact: true });
    await label.fill("Explore our field notes");
    await study.getByRole("textbox", { name: "Destination", exact: true }).fill("#field-notes");
    await study.getByLabel("Open in a new tab value mode", { exact: true }).selectOption("value");
    await study.getByRole("checkbox", { name: "Open in a new tab", exact: true }).check();
    const link = canvas.getByRole("link", { name: "Explore our field notes (opens in a new tab)", exact: true });
    await expect(link).toHaveAttribute("href", "#field-notes");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await label.fill("   ");
    await expect(label).toHaveAttribute("aria-invalid", "true");
    await label.fill("Explore our field notes");
    await expect(label).not.toHaveAttribute("aria-invalid", "true");
    await canvas.screenshot({ path: info.outputPath(`${pack}-feature-controls.png`) });
    await study.getByRole("button", { name: "Reset Icon", exact: true }).first().click();
    await expect(canvas.locator("svg.lucide-heart")).toHaveCount(0);
    await expect(canvas.locator("svg.cp-icon")).toHaveCount(2);
    await study.getByRole("button", { name: "Reset Feature link", exact: true }).first().click();
    await expect(canvas.getByRole("link")).toHaveCount(0);
  }
});

test("Bento authored sizes override position and collapse without reordering", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?block=core%2Fbento-grid&example=2", { waitUntil: "networkidle" });
  await page.getByText("Try local field edits", { exact: true }).click();
  const study = page.getByRole("region", { name: "Local block authoring preview" });
  const canvas = study.locator('[data-authoring-preview="canvas"]');
  const tiles = canvas.locator(".cp-library-bento > article");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await study.getByRole("button", { name: "Reset local draft", exact: true }).click();
    await expect(tiles.first()).toHaveAttribute("data-wide", "true");
    for (const [index, size] of ["standard", "wide", "standard"].entries()) {
      await study.getByLabel("Tile size value mode", { exact: true }).nth(index).selectOption("value");
      await study.getByRole("combobox", { name: "Tile size", exact: true }).nth(index).selectOption({ label: size });
    }
    await expect(tiles.first()).toHaveAttribute("data-wide", "false");
    await expect(tiles.nth(1)).toHaveAttribute("data-wide", "true");
    for (const width of [1104, 420]) {
      await canvas.evaluate((node, width) => {
        node.style.width = `${width}px`; node.style.maxWidth = "none";
        node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute("data-width", "full");
      }, width);
      const geometry = await tiles.evaluateAll(nodes => nodes.map(node => {
        const b = node.getBoundingClientRect(); return { width: b.width, y: b.y };
      }));
      expect(geometry).toHaveLength(3);
      if (width === 1104) expect(geometry[1].width).toBeGreaterThan(geometry[0].width * 1.9);
      else expect(Math.abs(geometry[1].width - geometry[0].width)).toBeLessThanOrEqual(1);
      expect(geometry[1].y).toBeGreaterThan(geometry[0].y);
      expect(geometry[2].y).toBeGreaterThan(geometry[1].y);
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await canvas.screenshot({ path: info.outputPath(`${pack}-bento-authored-${width}.png`) });
    }
    await study.getByRole("button", { name: "Reset Tile size", exact: true }).first().click();
    await expect(tiles.first()).toHaveAttribute("data-wide", "true");
  }
});
