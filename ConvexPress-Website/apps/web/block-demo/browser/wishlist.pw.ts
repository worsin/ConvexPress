import { test, expect } from "@playwright/test";
for (const width of [1440, 390])
	test(`Saved products across four packs at ${width}px`, async ({
		page,
	}, info) => {
		test.setTimeout(120000);
		await page.setViewportSize({ width, height: 1100 });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		await page.locator("#canonical-block").selectOption("commerce/wishlist");
		for (const pack of ["core", "journal", "depot", "aster-house"]) {
			await page.locator("#pack").selectOption(pack);
			const fixture = page.getByLabel("Synthetic saved-products fixture");
			await fixture.selectOption("empty");
			await fixture.selectOption("ready");
			const canvas = page.locator(".canonical-canvas");
			await expect(
				canvas.getByRole("heading", { name: "The morning mug" }),
			).toBeVisible();
			await expect(
				canvas.getByRole("link", { name: "Choose options", exact: true }),
			).toHaveAttribute("href", "/products/demo-product-notebook");
			await expect(
				canvas.getByRole("heading", { name: "Product no longer available" }),
			).toBeVisible();
			expect(
				await canvas.evaluate(
					(element) => element.scrollWidth > element.clientWidth,
				),
			).toBe(false);
			await canvas
				.getByRole("button", { name: "Move to basket", exact: true })
				.focus();
			await expect(
				canvas.getByRole("button", { name: "Move to basket", exact: true }),
			).toBeFocused();
			await canvas.screenshot({
				path: info.outputPath(`${pack}-${width}.png`),
				animations: "disabled",
			});
			await page.keyboard.press("Enter");
			await expect(
				canvas.getByRole("heading", { name: "The morning mug" }),
			).toHaveCount(0);
			await expect(canvas.getByRole("status")).toContainText(
				"Moved to your basket",
			);
			await canvas
				.getByRole("button", {
					name: "Remove unavailable product from saved products",
				})
				.click();
			await expect(
				canvas.getByRole("heading", { name: "Product no longer available" }),
			).toHaveCount(0);
			await fixture.selectOption("signed-out");
			await expect(
				canvas.getByRole("link", { name: "Sign in", exact: true }),
			).toHaveAttribute("href", "/login");
			await fixture.selectOption("loading");
			await expect(canvas.getByRole("status")).toHaveText(
				"Loading your saved products…",
			);
			await expect(canvas.locator(".cp-wishlist-card")).toHaveCount(0);
			await fixture.selectOption("empty");
			await expect(
				canvas.getByRole("link", { name: "Explore the shop", exact: true }),
			).toHaveAttribute("href", "/products");
		}
		await page
			.getByLabel("Synthetic saved-products fixture")
			.selectOption("ready");
		await page.emulateMedia({ reducedMotion: "reduce" });
		expect(
			await page
				.locator(".cp-wishlist-image img")
				.first()
				.evaluate((element) => getComputedStyle(element).transitionDuration),
		).toBe("0s");
		expect(errors).toEqual([]);
	});
