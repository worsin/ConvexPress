import { test, expect } from "@playwright/test";
for (const width of [1440, 390])
	test(`Wishlist dashboard and sharing across four packs at ${width}px`, async ({
		page,
	}, info) => {
		test.setTimeout(120000);
		await page.setViewportSize({ width, height: 1100 });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/wishlist-surfaces.html", { waitUntil: "networkidle" });
		// Prove the real Website utility sheet loaded before evaluating pack layout.
		await expect(page.locator("body")).toHaveCSS("margin", "0px");
		await expect(page.locator("#surface-canvas img").first()).toHaveCSS(
			"object-fit",
			"cover",
		);
		for (const pack of ["core", "journal", "depot", "aster-house"]) {
			await page.locator("#surface-pack").selectOption(pack);
			const canvas = page.locator("#surface-canvas");
			await page.locator("#surface-kind").selectOption("shared");
			await expect(
				canvas.getByRole("link", { name: "Choose options", exact: true }),
			).toHaveAttribute("href", "/products/demo-product-notebook");
			await page.locator("#surface-state").selectOption("session-pending");
			await expect(
				canvas.getByRole("button", { name: /add to cart/i }),
			).toBeDisabled();
			await page.locator("#surface-state").selectOption("ready");
			await canvas.getByRole("button", { name: /add to cart/i }).click();
			await expect(page.locator("#surface-receipt")).toHaveText(
				"Added saved-forest with variant forest",
			);
			expect(
				await canvas.evaluate(
					(element) => element.scrollWidth > element.clientWidth,
				),
			).toBe(false);
			await canvas.screenshot({
				path: info.outputPath(`shared-${pack}-${width}.png`),
				animations: "disabled",
			});
			const sharedPager = canvas.getByRole("navigation", {
				name: "Shared wishlist pages",
			});
			await sharedPager
				.getByRole("button", { name: "Next", exact: true })
				.click();
			await expect(
				canvas.getByText("Last saved product", { exact: true }).first(),
			).toBeVisible();
			await sharedPager
				.getByRole("button", { name: "Previous", exact: true })
				.click();
			await page.locator("#surface-state").selectOption("loading");
			await expect(
				canvas.getByText("The morning mug", { exact: true }),
			).toHaveCount(0);

			await page.locator("#surface-kind").selectOption("dashboard");
			await expect(
				canvas.getByText("Product no longer available", { exact: true }),
			).toBeVisible();
			await expect(
				canvas.getByRole("link", { name: "Choose options", exact: true }),
			).toBeVisible();
			// Outer overflow alone misses controls hidden inside nested scrolling tables.
			if (pack === "depot" && width === 390) {
				const bounds = await canvas.boundingBox();
				for (const control of await canvas.getByRole("button").all()) {
					if (!(await control.isVisible())) continue;
					const box = await control.boundingBox();
					expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
					expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
				}
			}
			await canvas.screenshot({
				path: info.outputPath(`dashboard-${pack}-${width}.png`),
				animations: "disabled",
			});
			expect(
				await canvas.evaluate(
					(element) => element.scrollWidth > element.clientWidth,
				),
			).toBe(false);
			await canvas
				.getByRole("button", {
					name: "Remove unavailable product",
					exact: true,
				})
				.click();
			await expect(page.locator("#surface-receipt")).toHaveText(
				"Removed saved-hidden",
			);
			const itemPager = canvas.getByRole("navigation", {
				name: "Everyday favourites product pages",
			});
			await itemPager
				.getByRole("button", { name: "Next", exact: true })
				.click();
			await expect(
				canvas.getByText("Last saved product", { exact: true }),
			).toBeVisible();
			await itemPager
				.getByRole("button", { name: "Previous", exact: true })
				.click();
			const listPager = canvas.getByRole("navigation", {
				name: "Wishlist collections",
			});
			await listPager
				.getByRole("button", { name: "Next", exact: true })
				.click();
			await expect(
				canvas.getByText("Gift ideas", { exact: true }),
			).toBeVisible();
			await listPager
				.getByRole("button", { name: "Previous", exact: true })
				.click();
		}
		expect(errors).toEqual([]);
	});
