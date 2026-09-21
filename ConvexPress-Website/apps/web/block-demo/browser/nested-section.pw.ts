import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
	test(`nested carousel composition shares page spacing at ${width}px`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width, height: 1000 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/", { waitUntil: "networkidle" });
		const packs = await page
			.locator("#pack option")
			.evaluateAll((nodes) =>
				nodes.map((node) => (node as HTMLOptionElement).value),
			);
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			await page.locator("#canonical-block").selectOption("core/carousel");
			const count = await page.locator("#canonical-example option").count();
			await page.locator("#canonical-example").selectOption(String(count - 1));
			const canvas = page.locator(".canonical-canvas");
			await expect(
				canvas.getByRole("heading", { name: "Clay & light" }),
			).toBeVisible();
			await canvas.scrollIntoViewIfNeeded();
			const geometry = await canvas.evaluate((node) => {
				const outer = node.querySelector<HTMLElement>(".cp-section")!;
				const nested = [
					...node.querySelectorAll<HTMLElement>(
						'.cp-section[data-nested="true"]',
					),
				].filter((el) => el.getBoundingClientRect().width > 0);
				return {
					outerPadding: parseFloat(getComputedStyle(outer).paddingTop),
					nested: nested.map((el) => ({
						top: parseFloat(getComputedStyle(el).paddingTop),
						bottom: parseFloat(getComputedStyle(el).paddingBottom),
						gutter: parseFloat(
							getComputedStyle(el.querySelector(".cp-container")!).paddingLeft,
						),
					})),
					overflow: node.scrollWidth > node.clientWidth + 1,
				};
			});
			expect(geometry.outerPadding).toBeGreaterThan(0);
			expect(geometry.nested).toHaveLength(2);
			for (const nested of geometry.nested)
				expect(nested).toEqual({ top: 0, bottom: 0, gutter: 0 });
			expect(geometry.overflow).toBe(false);
			await canvas
				.locator("img:visible")
				.evaluateAll((images) =>
					Promise.all(
						images.map((image) => (image as HTMLImageElement).decode()),
					),
				);
			await page
				.locator(".canonical-gallery")
				.screenshot({
					path: testInfo.outputPath(`nested-carousel-${width}-${pack}.png`),
					animations: "disabled",
				});
		}
	});
}
