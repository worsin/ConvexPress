import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [390, 1440]) {
  test(`native media controls play and pause across templates at ${width}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "networkidle" });
    const canvas = page.locator(".canonical-canvas");
    for (const pack of ["core", "journal", "depot", "aster-house"]) {
      await selectPackReady(page, pack);
      for (const kind of ["audio", "video"]) {
        await page.locator("#canonical-block").selectOption(`core/${kind}`);
        await page.locator("#canonical-example").selectOption("1");
        const media = canvas.locator(kind);
        await expect(media).toHaveAttribute("controls", "");
        expect(await media.getAttribute("autoplay")).toBeNull();
        await media.scrollIntoViewIfNeeded();
        await media.focus();
        await media.press("Space");
        await expect.poll(() => media.evaluate(node => (node as HTMLMediaElement).currentTime)).toBeGreaterThan(0);
        expect(await media.evaluate(node => (node as HTMLMediaElement).error)).toBeNull();
        await media.press("Space");
        expect(await media.evaluate(node => (node as HTMLMediaElement).paused)).toBe(true);
        await expect(canvas.getByRole("link", { name: "Read the sample transcript" })).toBeVisible();
        expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        await canvas.screenshot({ path: info.outputPath(`${pack}-${kind}-${width}.png`) });
      }
    }
  });
}
