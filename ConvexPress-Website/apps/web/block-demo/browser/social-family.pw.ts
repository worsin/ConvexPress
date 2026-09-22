import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("social proof displays authored notes, portraits and member links in every pack", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto("/?block=core%2Fstats-band&example=1", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const pack of ["core", "journal", "depot", "aster-house"]) {
      await selectPackReady(page, pack);
      for (const name of ["core/stats-band", "core/testimonials", "core/team-grid"]) {
        await page.locator("#canonical-block").selectOption(name);
        await page.locator("#canonical-example").selectOption("1");
        await expect(canvas).toHaveAttribute("data-canonical-block", name);
        await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
        if (name === "core/stats-band") await expect(canvas.getByText("Sample figure for one season.", { exact: true })).toBeVisible();
        else {
          const photo = canvas.locator("img").first();
          await expect(photo).toBeVisible();
          await expect.poll(() => photo.evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0)).toBe(true);
          if (name === "core/testimonials") await expect(photo).toHaveAttribute("alt", "AI-generated fictional studio collaborator");
          else {
            await expect(canvas.getByRole("link", { name: "Read the studies", exact: true })).toHaveAttribute("href", "#studies");
            await expect(canvas.getByRole("link", { name: "Studio notes (opens in a new tab)", exact: true })).toHaveAttribute("rel", "noopener noreferrer");
          }
        }
        expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        await canvas.screenshot({ path: info.outputPath(`${pack}-${name.split('/')[1]}-${width}.png`) });
      }
    }
  }
});

test("testimonial masonry adapts to authored width without splitting quotations", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?block=core%2Ftestimonial-wall&example=1", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    for (const width of [1104, 420]) {
      await canvas.evaluate((node, width) => {
        node.style.width = `${width}px`; node.style.maxWidth = "none";
        node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute("data-width", "full");
      }, width);
      const wall = canvas.locator(".cp-editorial-testimonial-wall");
      await expect(wall).toHaveCSS("display", "block");
      const geometry = await wall.locator(":scope > article").evaluateAll(nodes => nodes.map(node => ({ x: Math.round(node.getBoundingClientRect().x), fragments: node.getClientRects().length, text: node.textContent })));
      expect(geometry).toHaveLength(3);
      expect(geometry.map(node => node.fragments)).toEqual([1, 1, 1]);
      const columns = new Set(geometry.map(node => node.x)).size;
      if (width === 420) expect(columns).toBe(1);
      else expect(columns).toBeGreaterThan(1);
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await canvas.screenshot({ path: info.outputPath(`${pack}-masonry-${width}.png`) });
    }
  }
});
