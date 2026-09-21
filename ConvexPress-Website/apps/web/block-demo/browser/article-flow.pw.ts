import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
test("paragraphs keep readable article rhythm under every pack at desktop and mobile widths", async ({
	page,
}, testInfo) => {
	const metrics = [];
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/", { waitUntil: "networkidle" });
	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: 1000 });
		for (const pack of ["core", "journal", "depot", "aster-house"]) {
			await page.locator("#pack").selectOption(pack);
			const study = page.locator("[data-article-study]");
			await study.locator("summary").click();
			const canvas = page.locator("[data-article-flow-canvas]");
			await canvas.scrollIntoViewIfNeeded();
			const result = await canvas.evaluate((node) => {
				const paras = [...node.querySelectorAll("p")].map((p) => {
					const box = p.getBoundingClientRect();
					return {
						top: box.top,
						bottom: box.bottom,
						width: box.width,
						height: box.height,
						lineHeight: parseFloat(getComputedStyle(p).lineHeight),
					};
				});
				return {
					paras,
					overflow: document.documentElement.scrollWidth > innerWidth,
					sectionPadding: [...node.querySelectorAll(".cp-section")].map(
						(s) =>
							parseFloat(getComputedStyle(s).paddingTop) +
							parseFloat(getComputedStyle(s).paddingBottom),
					),
				};
			});
			expect(result.paras).toHaveLength(3);
			expect(result.overflow).toBe(false);
			expect(result.sectionPadding).toEqual([0, 0, 0]);
			for (const p of result.paras) {
				expect(p.width).toBeGreaterThan(0);
				expect(p.height).toBeGreaterThan(0);
			}
			for (let i = 1; i < result.paras.length; i++) {
				const gap = result.paras[i].top - result.paras[i - 1].bottom;
				expect(gap).toBeGreaterThanOrEqual(8);
				expect(gap).toBeLessThanOrEqual(result.paras[i].lineHeight * 1.5);
			}
			await expect(canvas.locator("strong")).toHaveText(/Made to be used/);
			await canvas.screenshot({
				path: testInfo.outputPath(`article-flow-${width}-${pack}.png`),
			});
			metrics.push({ width, pack, ...result });
		}
	}
	expect(errors).toEqual([]);
	const path = testInfo.outputPath("article-flow-geometry.json");
	await writeFile(path, JSON.stringify(metrics, null, 2));
	await testInfo.attach("article geometry", {
		path,
		contentType: "application/json",
	});
});
