import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [1440, 900, 390]) {
  test(`latest stories retain content and adapt to available width · ${width}`, async ({ page }, info) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/?block=core%2Flatest-posts&example=1&pack=journal");
    const canvas = page.locator(".canonical-canvas");
    const source = await page.locator(".canonical-source pre").textContent();
    const control = page.getByLabel("Story specimen", { exact: true });
    for (const pack of ["journal", "depot"]) {
      await selectPackReady(page, pack);
      const block = canvas.locator(`[data-pack-block="${pack}:core/latest-posts"]`);
      await expect(block).toHaveCount(1);
      for (const state of ["available", "single", "empty", "text-only", "long"]) {
        await control.selectOption(state);
        await expect(canvas.locator('.navigation-demo[data-demo-ready="true"]')).toHaveCount(1);
        const stories = block.locator("article");
        await expect(stories).toHaveCount(state === "empty" ? 0 : state === "single" ? 1 : 3);
        expect(await page.locator(".canonical-source pre").textContent()).toBe(source);
        if (state === "empty") await expect(block).toContainText("No posts to show yet.");
        else {
          await expect(stories.first().locator("h3 a")).toHaveAttribute("href", "/blog/the-quiet-work");
          if (state === "text-only") {
            await expect(block.locator("img, time")).toHaveCount(0);
            await expect(block).not.toContainText("By Aster Journal");
          } else {
            await expect(block.locator("time").first()).toHaveAttribute("datetime", "2026-09-05T00:00:00.000Z");
            await expect(block).toContainText("By Aster Journal");
            await expect.poll(() => block.locator("img").first().evaluate((n: HTMLImageElement) => n.complete && n.naturalWidth > 0)).toBe(true);
          }
          if (state === "available") {
            const geometry = await block.evaluate((node, pack) => {
              const story = node.querySelector("article")!;
              const box = (n: Element) => { const r = n.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,right:r.right }; };
              return { story:box(story), image:box(story.querySelector(".cp-image")!), copy:box(story.querySelector(`.${pack}-story-copy`)!), collection:box(node.querySelector(`.${pack}-stories`)!) };
            }, pack);
            if (pack === "journal") {
              expect(geometry.story.width).toBeCloseTo(geometry.collection.width, 0);
              if (geometry.collection.width >= 704) expect(geometry.copy.x).toBeGreaterThan(geometry.image.right);
              else expect(geometry.copy.y).toBeGreaterThan(geometry.image.y);
            } else if (geometry.collection.width >= 352) expect(geometry.copy.x).toBeGreaterThan(geometry.image.right);
          }
        }
        const overflow = await block.evaluate(node => [...node.querySelectorAll("article, h3, .cp-image"), node].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.className));
        expect(overflow).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await canvas.screenshot({ path:info.outputPath(`${pack}-${state}-${width}.png`), animations:"disabled" });
      }
      await control.selectOption("available");
      await expect(block.locator("article")).toHaveCount(3);
      await control.focus();
      await page.keyboard.press("Tab");
      const link = block.locator("h3 a").first();
      await expect(link).toBeFocused();
      expect(await link.evaluate(node => { const s=getComputedStyle(node);return s.outlineStyle !== "none" && parseFloat(s.outlineWidth)>0; })).toBe(true);
      await page.emulateMedia({ reducedMotion:"reduce" });
      await expect(link).toBeVisible();
      await page.emulateMedia({ reducedMotion:"no-preference" });
      // A narrow placement inside a wide page must follow its container, not the viewport.
      await canvas.evaluate(node => { node.style.width="280px"; });
      await expect.poll(() => block.evaluate(node => node.scrollWidth <= node.clientWidth+1)).toBe(true);
      const narrow = await block.locator("article").first().evaluate(node => ({image:node.querySelector(".cp-image")!.getBoundingClientRect().y,copy:node.querySelector('[class$="story-copy"]')!.getBoundingClientRect().y}));
      expect(narrow.copy).toBeGreaterThan(narrow.image);
      await canvas.evaluate(node => { node.style.removeProperty("width"); });
    }
    await selectPackReady(page,"core");
    expect(await page.locator(".canonical-source pre").textContent()).toBe(source);
    await expect(canvas.locator("h3 a").first()).toHaveAttribute("href","/blog/the-quiet-work");
    expect(errors).toEqual([]);
  });
}
