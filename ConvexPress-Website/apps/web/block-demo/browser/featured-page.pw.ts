import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
])
	test(`featured page uses bound demo data and clears stale viewer content at ${viewport.width}px`, async ({
		page,
	}, testInfo) => {
		test.setTimeout(120000);
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		const packs = await page
			.locator("#pack option")
			.evaluateAll((nodes) =>
				nodes.map((node) => (node as HTMLOptionElement).value),
			);
		const evidence: unknown[] = [];
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			await page.locator("#canonical-block").selectOption("core/featured-page");
			const canvas = page.locator(".canonical-canvas");
			await canvas.scrollIntoViewIfNeeded();
			for (const specimen of [
				{ index: 1, kind: "no-image", title: "Make room for observation" },
				{
					index: 2,
					kind: "long-copy",
					title:
						"The small observations that turn an ordinary afternoon into a practice worth returning to",
				},
				{ index: 3, kind: "unavailable", title: null },
				{ index: 4, kind: "image", title: "A quieter kind of making" },
			]) {
				await page
					.locator("#canonical-example")
					.selectOption(String(specimen.index));
				await expect(canvas.locator(".featured-data-demo")).toHaveAttribute(
					"data-demo-ready",
					"true",
				);
				const result = canvas.locator(".featured-demo-result");
				await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
				if (specimen.title) {
					await expect(
						result.getByRole("heading", { name: specimen.title }),
					).toBeVisible();
					await expect(result.getByRole("link")).toHaveCount(1);
				} else {
					await expect(result.getByRole("status")).toHaveText(
						"Featured page unavailable.",
					);
					await expect(result.getByRole("link")).toHaveCount(0);
				}
				await expect(result.locator("img")).toHaveCount(
					specimen.kind === "image" ? 1 : 0,
				);
				if (specimen.kind === "image") {
					await expect(result.locator("img")).toHaveAttribute(
						"alt",
						"A sunlit ceramic workbench with cobalt vessels",
					);
					await expect
						.poll(() =>
							result
								.locator("img")
								.evaluate(
									(node) =>
										node instanceof HTMLImageElement &&
										node.complete &&
										node.naturalWidth > 0,
								),
						)
						.toBe(true);
					await expect(result.getByRole("link")).toHaveAttribute(
						"href",
						"/#composition",
					);
				}
				if (specimen.kind === "long-copy")
					await expect(result).toContainText(
						"your attention will have changed",
					);
				const geometry = await result.evaluate((node) => ({
					width: node.getBoundingClientRect().width,
					height: node.getBoundingClientRect().height,
					client: node.clientWidth,
					scroll: node.scrollWidth,
				}));
				expect(geometry.width).toBeGreaterThan(0);
				expect(geometry.height).toBeGreaterThan(0);
				expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
				const path = testInfo.outputPath(
					`featured-${viewport.width}-${pack}-${specimen.kind}.png`,
				);
				await page
					.locator(".canonical-gallery")
					.screenshot({ path, animations: "disabled" });
				evidence.push({ pack, viewport, specimen, geometry, path });
				await writeFile(
					testInfo.outputPath("featured-data-evidence.json"),
					JSON.stringify(evidence, null, 2),
				);
			}
			const result = canvas.locator(".featured-demo-result");
			await canvas
				.getByRole("button", { name: "Invalidate demo data" })
				.click();
			await expect(result.getByRole("status")).toHaveText(
				"Featured page unavailable.",
			);
			await expect(result.locator("img,a")).toHaveCount(0);
			await expect(result).not.toContainText("A quieter kind of making");
			await canvas
				.getByRole("button", { name: "Resolve current view" })
				.click();
			await expect(
				result.getByRole("heading", { name: "A quieter kind of making" }),
			).toBeVisible();
			await canvas.getByLabel("Demo viewer").selectOption("demo-other");
			await expect(result.getByRole("status")).toHaveText(
				"Featured page unavailable.",
			);
			await expect(result.locator("img,a")).toHaveCount(0);
			await expect(result).not.toContainText("A quieter kind of making");
			await canvas.getByLabel("Demo viewer").selectOption("demo-anonymous");
			await expect(
				result.getByRole("heading", { name: "A quieter kind of making" }),
			).toBeVisible();
		}
		expect(errors).toEqual([]);
		await testInfo.attach("featured-data-evidence.json", {
			path: testInfo.outputPath("featured-data-evidence.json"),
			contentType: "application/json",
		});
	});
