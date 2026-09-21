import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
test("grade studies give copy and single-photo media a complete responsive row", async ({
	page,
}, testInfo) => {
	test.setTimeout(120000);
	await page.emulateMedia({ reducedMotion: "reduce" });
	const evidence: unknown[] = [];
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	for (const viewport of [
		{ width: 1440, height: 1000 },
		{ width: 390, height: 844 },
	]) {
		await page.setViewportSize(viewport);
		await page.goto("/", { waitUntil: "networkidle" });
		const packs = await page
			.locator("#pack option")
			.evaluateAll((nodes) =>
				nodes.map((node) => (node as HTMLOptionElement).value),
			);
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			await page
				.locator("#canonical-block")
				.selectOption("blocks/grade-gallery");
			const count = await page.locator("#canonical-example option").count();
			await page.locator("#canonical-example").selectOption(String(count - 1));
			const canvas = page.locator(".canonical-canvas");
			await canvas.scrollIntoViewIfNeeded();
			await expect(canvas).toHaveAttribute(
				"data-canonical-block",
				"blocks/grade-gallery",
			);
			await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
			await page.evaluate(() => document.fonts.ready);
			const studies = canvas.locator(".cp-library-grade-study");
			await expect(studies).toHaveCount(2);
			for (const study of await studies.all())
				await expect(study).toBeVisible();
			const geometry = await studies.evaluateAll((nodes) =>
				nodes.map((study) => {
					const layout = study.querySelector<HTMLElement>(
						".cp-library-grade-layout",
					);
					const copy = layout?.querySelector<HTMLElement>(
						":scope > .cp-library-card-copy",
					);
					const media = layout?.querySelector<HTMLElement>(
						":scope > .cp-library-grade-images",
					);
					const image = media?.querySelector("img");
					if (!layout || !copy || !media || !image)
						throw new Error("The real grade specimen is missing copy or image");
					const box = (node: Element) => {
						const rect = node.getBoundingClientRect();
						return {
							x: rect.x,
							y: rect.y,
							width: rect.width,
							height: rect.height,
							right: rect.right,
							bottom: rect.bottom,
						};
					};
					return {
						layout: box(layout),
						copy: box(copy),
						media: box(media),
						image: box(image),
						imageCount: media.querySelectorAll("img").length,
						columns:
							getComputedStyle(media).gridTemplateColumns.split(" ").length,
						width: layout.clientWidth,
						scrollWidth: layout.scrollWidth,
						title: copy.textContent,
					};
				}),
			);
			evidence.push({ pack, viewport, phase: "geometry", geometry });
			await writeFile(
				testInfo.outputPath("grade-gallery-geometry.json"),
				JSON.stringify(evidence, null, 2),
			);
			for (const item of geometry) {
				expect(item.imageCount).toBe(1);
				for (const box of [item.layout, item.copy, item.media, item.image]) {
					expect(box.width).toBeGreaterThan(0);
					expect(box.height).toBeGreaterThan(0);
				}
				expect(
					Math.abs(item.image.width - item.media.width),
				).toBeLessThanOrEqual(1);
				expect(item.scrollWidth).toBeLessThanOrEqual(item.width + 1);
				if (viewport.width === 1440) {
					expect(item.media.x).toBeGreaterThan(item.copy.right + 20);
					expect(item.media.width).toBeGreaterThan(item.layout.width * 0.55);
					expect(item.columns).toBe(2);
					expect(item.media.y).toBeLessThan(item.copy.bottom);
				} else {
					expect(item.media.y).toBeGreaterThan(item.copy.bottom + 20);
					expect(
						Math.abs(item.media.width - item.layout.width),
					).toBeLessThanOrEqual(1);
					expect(item.columns).toBe(1);
				}
			}
			const path = testInfo.outputPath(
				`grade-gallery-${viewport.width}-${pack}.png`,
			);
			await page
				.locator(".canonical-gallery")
				.screenshot({ path, animations: "disabled" });
			evidence.push({ pack, viewport, phase: "capture", path });
			await writeFile(
				testInfo.outputPath("grade-gallery-geometry.json"),
				JSON.stringify(evidence, null, 2),
			);
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true);
		}
	}
	expect(errors).toEqual([]);
	await testInfo.attach("grade-gallery-geometry.json", {
		path: testInfo.outputPath("grade-gallery-geometry.json"),
		contentType: "application/json",
	});
});
