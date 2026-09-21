import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [390, 1440]) {
  test(`comparison labels, reveal and keyboard agree in both directions at ${width}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/", { waitUntil: "networkidle" });
    const canvas = page.locator(".canonical-canvas");
    for (const pack of ["core", "journal", "depot", "aster-house"]) {
      await selectPackReady(page, pack);
      await page.locator("#canonical-block").selectOption("core/before-after");
      await page.locator("#canonical-example").selectOption("1");
      for (const direction of ["ltr", "rtl"]) {
        await canvas.evaluate((node, direction) => node.setAttribute("dir", direction), direction);
        const slider = canvas.getByRole("slider");
        await slider.focus();
        await slider.press("Home");
        await expect(slider).toHaveValue("0");
        for (let step = 0; step < 25; step++) await slider.press(direction === "rtl" ? "ArrowLeft" : "ArrowRight");
        await expect(slider).toHaveValue("25");
        await expect(slider).toHaveAttribute("aria-valuetext", /^25% Before/);
        const geometry = await canvas.locator(".cp-library-comparison").evaluate(node => {
          const frame = node.getBoundingClientRect();
          const line = node.querySelector(".cp-library-comparison-line")!.getBoundingClientRect();
          const before = node.querySelector('[data-side="before"]')!.getBoundingClientRect();
          const after = node.querySelector('[data-side="after"]')!.getBoundingClientRect();
          return { divider: (line.x + line.width / 2 - frame.x) / frame.width, beforeX: before.x, afterX: after.x, clip: getComputedStyle(node.querySelector(".cp-library-comparison-after")!).clipPath };
        });
        expect(geometry.divider, `${pack}/${direction}: divider follows the before label's side`).toBeCloseTo(direction === "rtl" ? .75 : .25, 2);
        expect(geometry.beforeX < geometry.afterX).toBe(direction === "ltr");
        expect(geometry.clip).toBe(direction === "rtl" ? "inset(0px 25% 0px 0px)" : "inset(0px 0px 0px 25%)");
        expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        await canvas.screenshot({ path: info.outputPath(`${pack}-${direction}-${width}.png`) });
        await slider.press("End");
        await expect(slider).toHaveAttribute("aria-valuetext", /^100% Before/);
      }
    }
  });
}
