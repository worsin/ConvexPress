import { selectPackReady } from "./pack-ready";
import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) test(`logo rows fill their available space · ${width}`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  const canvas = page.locator(".canonical-canvas");
  for (const pack of ["core", "aster-house", "journal", "depot"]) {
    await selectPackReady(page, pack);
    await page.locator("#canonical-block").selectOption("core/logo-cloud");
    for (const [example, count] of [[1, 1], [2, 4], [0, 0], [3, 2], [4, 3], [5, 5]]) {
      await page.locator("#canonical-example").selectOption(String(example));
      const logos = canvas.locator(".cp-library-logos");
      await expect(logos.locator(":scope > div")).toHaveCount(count);
      if (!count) {
        await expect(logos).not.toBeVisible();
        continue;
      }
      await logos.scrollIntoViewIfNeeded();
      const geometry = await logos.evaluate(node => {
        const parent = node.getBoundingClientRect();
        return { left: parent.left + 1, right: parent.right - 1, items: Array.from(node.children).map(child => {
          const rect = child.getBoundingClientRect();
          return { x: rect.left, y: rect.top, right: rect.right, width: rect.width };
        }) };
      });
      const rows = new Map<number, typeof geometry.items>();
      for (const item of geometry.items) {
        const y = Math.round(item.y);
        rows.set(y, [...(rows.get(y) ?? []), item]);
      }
      const columns = width >= 768 ? 4 : 2;
      expect(rows.size).toBe(Math.ceil(count / columns));
      for (const row of rows.values()) {
        expect(Math.abs(row[0].x - geometry.left)).toBeLessThan(1);
        expect(Math.abs(row.at(-1)!.right - geometry.right)).toBeLessThan(1);
        expect(row.every(item => item.width > 100)).toBe(true);
      }
      expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await canvas.screenshot({ path: info.outputPath(`${pack}-${count}-logos-${width}.png`), animations: "disabled" });
    }
  }
});
