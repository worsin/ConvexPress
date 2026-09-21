import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [1440, 390]) {
	test(`text and layout blocks respect template spacing · ${width}`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/", { waitUntil: "networkidle" });
		const study = page.locator("[data-core-text-study]");
		const canvas = study.locator("[data-core-text-canvas]");
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		for (const pack of ["core", "journal", "depot", "aster-house"]) {
			await selectPackReady(page, pack);
			await study.locator("summary").click();
			await expect(
				canvas.getByRole("heading", { level: 2, name: "Space to think." }),
			).toHaveAttribute("id", "space-to-think");
			await expect(canvas.getByRole("separator")).toHaveCount(1);
			await expect(
				canvas.getByRole("region", { name: "Intentional spacing" }),
			).toHaveCount(0);
			for (const spacing of ["none", "compact", "default", "spacious"]) {
				await study.getByLabel("Spacer spacing").selectOption(spacing);
				for (const id of ["flow-spacer", "flow-nested-spacer"]) {
					const spacer = canvas.locator(`[data-block-id="${id}"]`);
					await expect(spacer).toHaveAttribute("data-spacing", spacing);
					const metrics = await spacer.evaluate((el) => {
						const css = getComputedStyle(el);
						return {
							height: el.getBoundingClientRect().height,
							padding:
								parseFloat(css.paddingTop) + parseFloat(css.paddingBottom),
						};
					});
					expect(metrics.height).toBeCloseTo(metrics.padding, 1);
					if (spacing === "none") expect(metrics.height).toBe(0);
					else expect(metrics.height).toBeGreaterThan(0);
				}
			}
			await study.getByLabel("Spacer spacing").selectOption("compact");
			await study.getByLabel("Spacer tone").selectOption("muted");
			await expect(
				canvas.locator('[data-block-id="flow-spacer"]'),
			).toHaveAttribute("data-tone", "muted");
			expect(
				await canvas.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
			).toBe(true);
			await canvas.screenshot({
				path: info.outputPath(`${pack}-text-layout-${width}.png`),
			});
		}
		expect(errors).toEqual([]);
	});
}
