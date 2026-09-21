import { test, expect } from "@playwright/test";

const packs = ["core", "journal", "depot", "aster-house"];
const count = (nodes: { children?: any[] }[]): number =>
	nodes.reduce((total, node) => total + 1 + count(node.children ?? []), 0);
const normalize = (source: string) =>
	source.replace(/pack=[^&#"\s]+/gu, "pack=TEMPLATE");
for (const width of [1440, 390])
	test(`composed website pages across templates · ${width}`, async ({
		page,
	}, info) => {
		test.setTimeout(120000);
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/?demoPage=studio&pack=core#composed-pages", {
			waitUntil: "networkidle",
		});
		const canvas = page.locator(".composed-canvas"),
			ready = canvas.locator('[data-composed-ready="true"]');
		const originals = new Map<string, string>();
		let captured = 0;
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			for (const name of ["Studio", "Journal", "Collection"]) {
				await canvas
					.getByRole("navigation", { name: "Fieldwork pages" })
					.getByRole("link", { name, exact: true })
					.click();
				await expect(ready).toHaveCount(1);
				await expect(canvas.locator('[role="alert"]')).toHaveCount(0);
				await expect(canvas.locator(".composed-page-label")).toBeFocused();
				const source = (await page
					.locator(".composed-source pre")
					.textContent())!;
				if (pack === "core") originals.set(name, normalize(source));
				else expect(normalize(source)).toBe(originals.get(name));
				await expect(canvas.locator("[data-block-id]")).toHaveCount(
					count(JSON.parse(source)),
				);
				await expect(canvas.locator(".composed-content h1")).toHaveCount(1);
				if (pack === "journal" || pack === "depot")
					expect(
						await canvas.locator(`[data-pack-block^="${pack}:"]`).count(),
					).toBeGreaterThan(0);
				else await expect(canvas.locator("[data-pack-block]")).toHaveCount(0);
				for (const image of await canvas.locator("img").all())
					await image.scrollIntoViewIfNeeded();
				await expect
					.poll(() =>
						canvas
							.locator("img")
							.evaluateAll((images) =>
								images.every(
									(image) =>
										image instanceof HTMLImageElement &&
										image.complete &&
										image.naturalWidth > 0,
								),
							),
					)
					.toBe(true);
				expect(
					await canvas.evaluate(
						(node) => node.scrollWidth <= node.clientWidth + 1,
					),
				).toBe(true);
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth + 1,
					),
				).toBe(true);
				await canvas.screenshot({
					path: info.outputPath(`${pack}-${name}-${width}.png`),
					animations: "disabled",
				});
				captured++;
				if (name === "Studio") {
					const question = canvas
						.locator("summary")
						.filter({ hasText: "What is Fieldwork?" });
					await question.focus();
					await page.keyboard.press("Enter");
					await expect(question.locator("..")).toHaveAttribute("open", "");
					await page.keyboard.press("Enter");
					await expect(question.locator("..")).not.toHaveAttribute("open", "");
				} else {
					const story = name === "Journal";
					const link = story
						? canvas.getByRole("link", {
								name: "The quiet work of making",
								exact: true,
							})
						: canvas.getByRole("link", { name: /The morning mug/ });
					await link.focus();
					await page.keyboard.press("Enter");
					await expect(canvas).toHaveAttribute(
						"data-composed-page",
						story ? "story" : "product",
					);
					await expect(ready).toHaveCount(1);
					await expect(canvas.locator(".composed-content h1")).toHaveText(
						story ? "The quiet work of making" : "The morning mug",
					);
					await expect(canvas.locator(".composed-page-label")).toBeFocused();
					for (const image of await canvas.locator("img").all())
						await image.scrollIntoViewIfNeeded();
					await expect
						.poll(() =>
							canvas
								.locator("img")
								.evaluateAll((images) =>
									images.every(
										(image) =>
											image instanceof HTMLImageElement &&
											image.complete &&
											image.naturalWidth > 0,
									),
								),
						)
						.toBe(true);
					expect(
						await canvas.evaluate(
							(node) => node.scrollWidth <= node.clientWidth + 1,
						),
					).toBe(true);
					await canvas.screenshot({
						path: info.outputPath(
							`${pack}-${story ? "story" : "product"}-${width}.png`,
						),
						animations: "disabled",
					});
					captured++;
					await page.reload({ waitUntil: "networkidle" });
					await expect(canvas).toHaveAttribute(
						"data-composed-page",
						story ? "story" : "product",
					);
					await expect(page.locator("#pack")).toHaveValue(pack);
					await expect(ready).toHaveCount(1);
					await page.goBack();
					await expect(canvas).toHaveAttribute(
						"data-composed-page",
						story ? "journal" : "shop",
					);
					await expect(ready).toHaveCount(1);
				}
				expect(errors).toEqual([]);
			}
		}
		expect(captured).toBe(20);
	});

test("composed page invalid links, calls to action and rapid template changes", async ({
	page,
}) => {
	await page.goto(
		"/?pack=journal&demoPage=product&demoItem=missing#composed-pages",
		{ waitUntil: "networkidle" },
	);
	const canvas = page.locator(".composed-canvas");
	await expect(canvas).toHaveAttribute("data-composed-page", "studio");
	await expect(canvas.locator('[data-composed-ready="true"]')).toHaveCount(1);
	await canvas
		.getByRole("link", { name: "Meet the collection", exact: true })
		.click();
	await expect(canvas).toHaveAttribute("data-composed-page", "shop");
	for (const pack of ["depot", "core", "journal", "aster-house", "depot"])
		await page.locator("#pack").selectOption(pack);
	await expect(canvas).toHaveAttribute("data-composed-pack", "depot");
	await expect(canvas.locator('[data-composed-ready="true"]')).toHaveCount(1);
	await expect(
		canvas.locator('[data-pack-block="depot:commerce/product-showcase"]'),
	).toHaveCount(1);
	await expect(canvas.locator('[role="alert"]')).toHaveCount(0);
	await canvas
		.getByRole("link", { name: "Step inside the studio", exact: true })
		.click();
	await expect(canvas).toHaveAttribute("data-composed-page", "studio");
	await canvas
		.getByRole("link", { name: "Our field notes", exact: true })
		.click();
	await expect(canvas).toHaveAttribute("data-composed-page", "journal");
	await expect(canvas.locator('[data-composed-ready="true"]')).toHaveCount(1);
	await expect(
		canvas.getByRole("navigation", { name: "Post grid pagination" }),
	).toHaveCount(0);
	await page.goto("/products/demo-product-mug?pack=core#composed-pages", {
		waitUntil: "networkidle",
	});
	await expect(canvas).toHaveAttribute("data-composed-page", "product");
	await expect(canvas.locator(".composed-content h1")).toHaveText(
		"The morning mug",
	);
	await canvas
		.getByRole("link", { name: "Back to the collection", exact: true })
		.click();
	await expect(canvas).toHaveAttribute("data-composed-page", "shop");
});
