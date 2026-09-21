import { test, expect, type Locator } from "@playwright/test";

const packs = {
	core: "Core",
	journal: "Journal",
	depot: "Depot",
	"aster-house": "Aster House",
};
for (const width of [1440, 390])
	test(`commerce alternate states and purchase controls · ${width}`, async ({
		page,
	}, info) => {
		test.setTimeout(120000);
		await page.setViewportSize({ width, height: 1000 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		const canvas = page.locator(".canonical-canvas");
		let captures = 0;
		const select = async (name: string) => {
			await page.locator("#canonical-block").selectOption(name);
			await page.locator("#canonical-example").selectOption("0");
			await expect(canvas.locator('[data-demo-ready="false"]')).toHaveCount(0);
			await expect(canvas.locator("[data-block-id]").first()).toBeAttached();
			await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
		};
		const capture = async (name: string, scrollRegion?: Locator) => {
			for (const image of await canvas.locator("img:visible").all())
				await image.scrollIntoViewIfNeeded();
			await expect
				.poll(() =>
					canvas
						.locator("img:visible")
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
			if (scrollRegion)
				await scrollRegion.evaluate((node) =>
					node.scrollTo({ left: 0, behavior: "instant" }),
				);
			await page.evaluate(() => document.fonts.ready);
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
				path: info.outputPath(`${name}-${width}.png`),
				animations: "disabled",
			});
			expect(errors).toEqual([]);
			captures++;
		};
		for (const [pack, title] of Object.entries(packs)) {
			await page.locator("#pack").selectOption(pack);
			await expect(page.locator(".theme-status strong")).toHaveText(title);
			await expect
				.poll(() =>
					page
						.locator('link[rel="stylesheet"][href*="fonts.googleapis.com"]')
						.evaluateAll((nodes) =>
							nodes.every(
								(node) =>
									node instanceof HTMLLinkElement && node.sheet !== null,
							),
						),
				)
				.toBe(true);

			await select("commerce/cart-cta");
			const cartFixture = canvas.getByRole("combobox", {
				name: "Synthetic basket fixture",
			});
			for (const state of [
				"ready",
				"empty",
				"loading",
				"payment-pending",
				"unavailable",
				"large",
			]) {
				await cartFixture.selectOption(state);
				await expect(canvas.locator(".cp-cart-cta")).toHaveAttribute(
					"data-cart-state",
					state === "large" ? "ready" : state,
				);
				const checkout = canvas.getByRole("link", {
					name: "Continue to checkout",
					exact: true,
				});
				if (state === "ready" || state === "large") {
					await expect(checkout).toHaveAttribute("href", "/checkout");
					await checkout.focus();
					await expect(checkout).toBeFocused();
					await expect(canvas.getByRole("status")).toContainText(
						state === "large" ? "12500 items" : "3 items",
					);
					await expect(canvas.locator(".cp-cart-cta-total")).toContainText(
						state === "large" ? "$1,234,567.89" : "$86.00",
					);
				} else {
					await expect(checkout).toHaveCount(0);
					if (state === "payment-pending") {
						await expect(canvas.getByRole("status")).toContainText(
							"Payment is in progress",
						);
						await expect(canvas.locator(".cp-cart-cta-total")).toContainText(
							"$86.00",
						);
					} else
						await expect(canvas.locator(".cp-cart-cta-total")).toHaveCount(0);
					if (state === "empty")
						await expect(
							canvas.getByRole("link", {
								name: "Explore the shop",
								exact: true,
							}),
						).toHaveAttribute("href", "/products");
					else
						await expect(
							canvas.getByRole("link", { name: "View basket", exact: true }),
						).toHaveAttribute("href", "/cart");
					if (state === "loading")
						await expect(canvas.getByRole("status")).toHaveText(
							"Loading your basket…",
						);
				}
				await capture(`${pack}-cart-${state}`);
			}

			await select("commerce/bundle-offer");
			const bundleFixture = canvas.getByRole("combobox", {
				name: "Bundle preview scenario",
			});
			const add = canvas.getByRole("button", {
				name: "Add set to cart",
				exact: true,
			});
			await expect(add).toBeEnabled();
			await expect(canvas.locator(".cp-bundle-total")).toContainText("$55.80");
			const options = canvas.getByRole("combobox", {
				name: "The Field Notebook option",
			});
			await expect(options.locator('option[value="sand"]')).toBeDisabled();
			await options.selectOption("ink");
			await expect(canvas.locator(".cp-bundle-total")).toContainText("$59.40");
			await canvas
				.getByRole("button", { name: "Reset choices", exact: true })
				.click();
			await expect(options).toHaveValue("forest");
			const mug = canvas.getByRole("checkbox", {
				name: "Include The Morning Mug",
				exact: true,
			});
			await mug.focus();
			await page.keyboard.press("Space");
			await expect(mug).not.toBeChecked();
			await expect(canvas.locator(".cp-bundle-total")).toContainText("$21.60");
			await page.keyboard.press("Space");
			await expect(mug).toBeChecked();
			const increase = canvas.getByRole("button", {
				name: "Increase The Field Notebook quantity",
				exact: true,
			});
			await increase.click();
			await increase.click();
			await expect(increase).toBeDisabled();
			await canvas
				.getByRole("button", {
					name: "Increase The Morning Mug quantity",
					exact: true,
				})
				.click();
			await canvas
				.getByRole("checkbox", { name: "Include A Good Pencil", exact: true })
				.check();
			await expect(add).toBeDisabled();
			await expect(canvas.getByRole("status")).toHaveText(
				"Remove 1 item to keep this set within its 5-item limit.",
			);
			await capture(`${pack}-bundle-over-limit`);
			await canvas
				.getByRole("button", { name: "Reset choices", exact: true })
				.click();
			await expect(add).toBeEnabled();
			await add.focus();
			await page.keyboard.press("Enter");
			await expect(canvas.getByRole("status")).toContainText(
				"No cart or order was created.",
			);
			await capture(`${pack}-bundle-configurable`);
			await bundleFixture.selectOption("fixed");
			await expect(canvas.locator('[data-demo-ready="true"]')).toHaveCount(1);
			await expect(canvas.getByRole("checkbox")).toHaveCount(0);
			await expect(
				canvas.getByRole("button", { name: /^Increase / }),
			).toHaveCount(0);
			await expect(add).toBeEnabled();
			await expect(canvas.locator(".cp-bundle-total")).toContainText("$61.20");
			await capture(`${pack}-bundle-fixed`);
			await bundleFixture.selectOption("sold-out");
			await expect(add).toBeDisabled();
			await expect(canvas.getByRole("status")).toHaveText(
				"This set is unavailable with the current choices.",
			);
			await capture(`${pack}-bundle-sold-out`);
			await bundleFixture.selectOption("unavailable");
			await expect(canvas).toContainText(
				"This set is not available right now.",
			);
			await expect(add).toHaveCount(0);
			await expect(canvas.locator(".cp-bundle-total")).toHaveCount(0);
			await expect(
				canvas.getByRole("link", { name: "Explore bundles", exact: true }),
			).toHaveAttribute("href", "/bundles");
			await capture(`${pack}-bundle-unavailable`);

			await select("commerce/product-compare");
			const compareFixture = canvas.getByRole("combobox", {
				name: "Comparison preview scenario",
			});
			const comparison = canvas.getByRole("region", {
				name: "Product comparison",
				exact: true,
			});
			await expect(comparison.getByRole("columnheader")).toHaveCount(3);
			await expect(
				comparison.getByRole("rowheader", { name: "Format", exact: true }),
			).toHaveCount(1);
			const differences = canvas.getByRole("checkbox", {
				name: "Only show differences",
				exact: true,
			});
			await differences.focus();
			await page.keyboard.press("Space");
			await expect(differences).toBeChecked();
			await expect(
				comparison.getByRole("rowheader", { name: "Format", exact: true }),
			).toHaveCount(0);
			await expect(
				comparison.getByRole("rowheader", { name: "SKU", exact: true }),
			).toHaveCount(1);
			await comparison.focus();
			await expect(comparison).toBeFocused();
			if (width === 390) {
				await comparison.evaluate((node) =>
					node.scrollTo({ left: 0, behavior: "instant" }),
				);
				await page.keyboard.press("ArrowRight");
				await expect
					.poll(() => comparison.evaluate((node) => node.scrollLeft))
					.toBeGreaterThan(0);
			}
			await capture(`${pack}-compare-differences`, comparison);
			await compareFixture.selectOption("one");
			await expect(comparison.getByRole("columnheader")).toHaveCount(1);
			await expect(differences).toHaveCount(0);
			await expect(
				comparison.getByRole("rowheader", { name: "Format", exact: true }),
			).toHaveCount(1);
			await capture(`${pack}-compare-one`, comparison);
			for (const state of ["empty", "unavailable"]) {
				await compareFixture.selectOption(state);
				await expect(comparison).toHaveCount(0);
				await expect(canvas).toContainText(
					state === "empty"
						? "Choose products to compare their details."
						: "These products are not available right now.",
				);
				await expect(canvas.locator(".cp-compare-price")).toHaveCount(0);
				await capture(`${pack}-compare-${state}`);
			}
		}
		expect(captures).toBe(60);
		expect(errors).toEqual([]);
	});
