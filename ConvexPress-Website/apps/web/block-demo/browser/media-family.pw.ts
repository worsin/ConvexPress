import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const name of ["core/media-text", "core/gallery", "core/logo-cloud"]) test(`${name} adapts to its authored column`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  await page.addStyleTag({ content: ".canonical-canvas { inline-size:var(--media-review-width); max-inline-size:100%; }" });
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    await selectPackReady(page, pack);
    await page.locator("#canonical-block").selectOption(name);
    await page.locator("#canonical-example").selectOption(name === "core/gallery" ? "1" : "2");
    for (const width of [420, 760, 1200]) {
      await canvas.evaluate((node, width) => (node as HTMLElement).style.setProperty("--media-review-width", `${width}px`), width);
      await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
      const layout = canvas.locator(name === "core/media-text" ? ".cp-split" : name === "core/gallery" ? ".cp-library-gallery" : ".cp-library-logos");
      const boxes = await layout.evaluate(node => Array.from(node.children).map(child => {
        const r = child.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
      }));
      if (name === "core/media-text") {
        if (width < 800) expect(boxes[1].y, `${pack}/${width}: media and copy stack`).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height - 1);
        else expect(Math.abs(boxes[1].x - boxes[0].x)).toBeGreaterThan(200);
      } else if (name === "core/gallery") {
        expect(new Set(boxes.map(box => Math.round(box.x))).size).toBe(width < 600 ? 1 : 2);
      } else {
        expect(new Set(boxes.map(box => Math.round(box.y))).size).toBe(width < 800 ? 2 : 1);
        expect(boxes.every(box => box.width >= 120)).toBe(true);
      }
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      for (const image of await canvas.locator("img").all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(node => (node as HTMLImageElement).decode());
      }
      await canvas.screenshot({ path: info.outputPath(`${pack}-${name.split("/")[1]}-${width}.png`), animations: "disabled" });
    }
  }
});
