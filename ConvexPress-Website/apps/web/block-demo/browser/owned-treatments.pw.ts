import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const packs = ["journal", "depot"];
const manifests = packs.map((pack) =>
	JSON.parse(
		readFileSync(
			new URL(
				`../../src/templates/packs/${pack}/template.json`,
				import.meta.url,
			),
			"utf8",
		),
	),
);
const names = Object.keys(manifests[0].blocks.renderers).sort();
for (const width of [1440, 390])
	test(`owned flagship treatments preserve content across templates · ${width}`, async ({
		page,
	}, info) => {
		test.setTimeout(180000);
		expect(names).toHaveLength(15);
		expect(Object.keys(manifests[1].blocks.renderers).sort()).toEqual(names);
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("console", (message) => {
			if (message.type() === "error") errors.push(message.text());
		});
		await page.goto("/", { waitUntil: "networkidle" });
		const canvas = page.locator(".canonical-canvas");
		for (const name of names) {
			await page.locator("#canonical-block").selectOption(name);
			const options = await page
				.locator("#canonical-example option")
				.evaluateAll((options) =>
					options.map((o) => (o as HTMLOptionElement).value),
				);
			for (const example of options) {
				await page.locator("#canonical-example").selectOption(example);
				const source = await page
					.locator(".canonical-source pre")
					.textContent();
				for (const pack of ["journal", "depot", "core"]) {
					await page.locator("#pack").selectOption(pack);
					await expect(canvas.locator('[data-demo-ready="false"]')).toHaveCount(
						0,
					);
					await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
					await expect(
						canvas.locator("[data-block-id]").first(),
					).toBeAttached();
					if (pack === "core")
						await expect(canvas.locator("[data-pack-block]")).toHaveCount(0);
					else
						await expect(
							canvas.locator(`[data-pack-block="${pack}:${name}"]`),
						).toHaveCount(1);
					expect(
						await page.locator(".canonical-source pre").textContent(),
					).toBe(source);
					const geometry = await canvas.evaluate((node) => ({
						width: node.clientWidth,
						scroll: node.scrollWidth,
					}));
					expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
					if (name === "core/pricing-cards") {
						const grid = canvas.locator(".cp-grid").first();
						const widths = await grid.evaluate((node) => ({
							grid: node.getBoundingClientRect().width,
							parent: node.parentElement!.getBoundingClientRect().width,
						}));
						expect(widths.grid).toBeGreaterThanOrEqual(widths.parent - 1);
					}
					if (
						pack === "depot" &&
						name === "commerce/product-showcase" &&
						example === "1"
					) {
						const headingSize = await canvas
							.locator(".cp-showcase-intro h2")
							.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
						const cardSize = await canvas
							.locator(".cp-collection-card h3")
							.first()
							.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
						expect(headingSize).toBeGreaterThan(cardSize);
					}
					expect(errors).toEqual([]);
					if (pack !== "core")
						await canvas.screenshot({
							path: info.outputPath(
								`${pack}-${name.replaceAll("/", "-")}-${example}-${width}.png`,
							),
							animations: "disabled",
						});
				}
			}
		}
	});
