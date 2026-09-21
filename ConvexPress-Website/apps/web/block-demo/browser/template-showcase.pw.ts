import { test, expect } from "@playwright/test";
const packs = ["core", "journal", "depot", "aster-house"];
for (const width of [1440, 390])
	test(`template collection and full-page examples · ${width}`, async ({
		page,
	}, info) => {
		test.setTimeout(120000);
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		const collection = page.locator("#templates");
		await expect(collection.locator("a[data-template-example]")).toHaveCount(4);
		for (const image of await collection.locator("img").all()) {
			await image.scrollIntoViewIfNeeded();
			await expect
				.poll(() =>
					image.evaluate(
						(node: HTMLImageElement) =>
							node.complete && node.naturalWidth === 1400,
					),
				)
				.toBe(true);
		}
		await collection.screenshot({
			path: info.outputPath(`collection-${width}.png`),
		});
		const first = collection.locator('[data-template-example="core"]');
		await first.focus();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/view=website/);
		await expect(page.locator("#block-library")).toHaveCount(0);
		await expect(page.locator(".composed-source")).toHaveCount(0);
		const canvas = page.locator(".composed-canvas");
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			for (const [label, route] of [
				["Studio", "studio"],
				["Journal", "journal"],
				["Collection", "shop"],
			]) {
				await canvas
					.getByRole("navigation", { name: "Fieldwork pages" })
					.getByRole("link", { name: label, exact: true })
					.click();
				await expect(canvas).toHaveAttribute("data-composed-page", route);
				await expect(canvas).toHaveAttribute("data-composed-pack", pack);
				await expect(
					canvas.locator('[data-composed-ready="true"]'),
				).toHaveCount(1);
				await expect(canvas.locator(".composed-content h1")).toHaveCount(1);
				await expect(canvas.locator(".composed-page-label")).toBeFocused();
				for (const image of await canvas.locator("img").all()) {
					await image.scrollIntoViewIfNeeded();
					await expect
						.poll(() =>
							image.evaluate(
								(node: HTMLImageElement) =>
									node.complete && node.naturalWidth > 0,
							),
						)
						.toBe(true);
				}
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth + 1,
					),
				).toBe(true);
				await page.evaluate(() => window.scrollTo(0, 0));
				await page.screenshot({
					path: info.outputPath(`${pack}-${route}-${width}.png`),
					fullPage: true,
				});
				if (route !== "studio") {
					const link =
						route === "journal"
							? canvas.getByRole("link", {
									name: "The quiet work of making",
									exact: true,
								})
							: canvas.getByRole("link", { name: /The morning mug/ });
					await link.focus();
					await page.keyboard.press("Enter");
					await expect(canvas).toHaveAttribute(
						"data-composed-page",
						route === "journal" ? "story" : "product",
					);
					expect(new URL(page.url()).searchParams.get("view")).toBe("website");
					await page.reload({ waitUntil: "networkidle" });
					await expect(page.locator("#pack")).toHaveValue(pack);
					await expect(
						canvas.locator('[data-composed-ready="true"]'),
					).toHaveCount(1);
					await expect(page.locator("#block-library")).toHaveCount(0);
					await page.goBack();
					await expect(canvas).toHaveAttribute("data-composed-page", route);
				}
			}
		}
		await page.getByRole("link", { name: "← BlockDemo", exact: true }).click();
		await expect(page.locator("#pack")).toHaveValue("aster-house");
		await expect(page.locator("#templates")).toBeVisible();
		const library = page.locator("#block-library");
		await library
			.getByRole("searchbox", { name: "Find a block" })
			.fill("hero split");
		const image = library.locator('a[data-block-study="core/hero-split"] img');
		await image.scrollIntoViewIfNeeded();
		await expect
			.poll(() =>
				image.evaluate(
					(node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
				),
			)
			.toBe(true);
		const original = await image.getAttribute("src");
		await page.locator("#pack").selectOption("depot");
		await expect(image).toHaveAttribute("data-preview-pack", "depot");
		await expect(image).not.toHaveAttribute("src", original!);
		await expect
			.poll(() =>
				image.evaluate(
					(node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
				),
			)
			.toBe(true);
		await library.screenshot({
			path: info.outputPath(`visual-library-${width}.png`),
		});
		expect(errors).toEqual([]);
	});
