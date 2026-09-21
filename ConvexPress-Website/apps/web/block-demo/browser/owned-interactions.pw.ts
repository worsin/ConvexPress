import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [1440, 390])
	test(`all template category, product and FAQ interactions · ${width}`, async ({
		page,
	}, info) => {
		test.setTimeout(60_000);
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		const canvas = page.locator(".canonical-canvas");
		const capture = async (name: string) => {
			for (const image of await canvas.locator("img").all())
				await image.evaluate(async element => { await (element as HTMLImageElement).decode(); });
			expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
			await canvas.screenshot({ path: info.outputPath(`${name}-${width}.png`), animations: "disabled" });
		};
		for (const pack of ["core", "aster-house", "journal", "depot"]) {
			await selectPackReady(page, pack);
			await page
				.locator("#canonical-block")
				.selectOption("commerce/category-tiles");
			await page.locator("#canonical-example").selectOption("1");
			const category = canvas.locator(".cp-category-tile").first();
			await expect(category).toBeVisible();
			const destination = await category.getAttribute("href");
			expect(destination).toBe("/categories/home");
			await category.focus();
			await expect(category).toBeFocused();
			await canvas
				.getByRole("combobox", { name: "Category specimen" })
				.selectOption("empty");
			await expect(canvas.locator(".cp-category-tile")).toHaveCount(0);
			await expect(canvas).toContainText("A collection in the making.");
			await capture(`${pack}-categories-empty`);
			await canvas
				.getByRole("combobox", { name: "Category specimen" })
				.selectOption("available");
			await expect(category).toHaveAttribute("href", destination!);
			await canvas.screenshot({
				path: info.outputPath(`${pack}-categories-restored-${width}.png`),
				animations: "disabled",
			});

			await page
				.locator("#canonical-block")
				.selectOption("commerce/product-showcase");
			await page.locator("#canonical-example").selectOption("1");
			const notebook = canvas
				.locator(".cp-collection-card")
				.filter({
					has: page.getByRole("heading", { name: "Field notes, kept close" }),
				});
			await expect(notebook).toContainText("$18.00");
			await expect(notebook.locator("del")).toHaveText("$24.00");
			// The preview has no cart host: production behavior must keep the real product link.
			await expect(
				notebook.getByRole("link", { name: /^View product/ }),
			).toHaveAttribute("href", "/products/demo-product-notebook");
			await expect(
				notebook.getByRole("button", { name: /Add to cart/ }),
			).toHaveCount(0);
			await page.locator("#canonical-example").selectOption("4");
			await expect(canvas.locator(".cp-collection-card")).toHaveCount(0);
			await expect(canvas).toContainText("More good things are on the way.");
			await capture(`${pack}-products-empty`);
			await page.locator("#canonical-example").selectOption("1");
			await expect(notebook).toContainText("$18.00");
			await capture(`${pack}-products-restored`);

			await page.locator("#canonical-block").selectOption("core/faq");
			await page.locator("#canonical-example").selectOption("1");
			const question = canvas.locator("summary").first();
			await question.focus();
			await page.keyboard.press("Enter");
			await expect(question.locator("..")).toHaveAttribute("open", "");
			await canvas.screenshot({
				path: info.outputPath(`${pack}-faq-open-${width}.png`),
				animations: "disabled",
			});
			await page.keyboard.press("Space");
			await expect(question.locator("..")).not.toHaveAttribute("open", "");
			expect(
				await canvas.evaluate(
					(node) => node.scrollWidth <= node.clientWidth + 1,
				),
			).toBe(true);
		}
		expect(errors).toEqual([]);
	});
