import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(
	readFileSync(
		new URL("../../../../../blocks/.generated/catalog.json", import.meta.url),
		"utf8",
	),
) as { name: string; title: string; category: string; examples: unknown[] }[];
for (const width of [1440, 390])
	test(`block library categories, search and direct studies · ${width}`, async ({
		page,
	}, info) => {
		test.setTimeout(60000);
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		const library = page.locator("#block-library"),
			results = library.getByRole("region", { name: "Block catalog results" }),
			search = library.getByRole("searchbox", { name: "Find a block" });
		await expect(results.locator("a[data-block-study]")).toHaveCount(
			catalog.length,
		);
		expect(
			(
				await results
					.locator("a[data-block-study]")
					.evaluateAll((nodes) =>
						nodes.map((node) => node.getAttribute("data-block-study")),
					)
			).sort(),
		).toEqual(catalog.map((item) => item.name).sort());
		const categories = library
			.getByRole("navigation", { name: "Block categories" })
			.getByRole("button");
		await expect(categories).toHaveCount(
			new Set(catalog.map((item) => item.category)).size + 1,
		);
		for (const button of await categories.all()) {
			await button.click();
			await expect(button).toHaveAttribute("aria-pressed", "true");
			const total = Number(
				(await button.locator("span").last().textContent())!,
			);
			await expect(results.locator("a[data-block-study]")).toHaveCount(total);
		}
		await library.getByRole("button", { name: /^Commerce/ }).click();
		await search.fill("product showcase");
		await expect(results.locator("a[data-block-study]")).toHaveCount(1);
		await page.locator("#pack").selectOption("depot");
		const study = results.locator(
			'a[data-block-study="commerce/product-showcase"]',
		);
		await study.focus();
		await page.keyboard.press("Enter");
		await expect(page.locator("#canonical-block")).toHaveValue(
			"commerce/product-showcase",
		);
		await expect(page.locator("#block-study h2")).toBeFocused();
		await expect(
			page.locator(
				'.canonical-canvas [data-pack-block="depot:commerce/product-showcase"]',
			),
		).toHaveCount(1);
		const source = await page.locator(".canonical-source pre").textContent();
		const selected = new URL(page.url());
		expect(selected.searchParams.get("pack")).toBe("depot");
		expect(selected.searchParams.get("block")).toBe(
			"commerce/product-showcase",
		);
		await page.reload({ waitUntil: "networkidle" });
		await expect(page.locator("#pack")).toHaveValue("depot");
		await expect(page.locator("#canonical-block")).toHaveValue(
			"commerce/product-showcase",
		);
		expect(await page.locator(".canonical-source pre").textContent()).toBe(
			source,
		);
		await page.locator("#canonical-block").selectOption("core/faq");
		await page.goBack();
		await expect(page.locator("#canonical-block")).toHaveValue(
			"commerce/product-showcase",
		);
		await search.fill("no-such-block-9a7");
		await expect(
			library.getByRole("heading", { name: "No blocks found." }),
		).toBeVisible();
		await library.getByRole("button", { name: "Show all blocks" }).click();
		await expect(results.locator("a[data-block-study]")).toHaveCount(
			catalog.length,
		);
		await library.scrollIntoViewIfNeeded();
		expect(
			await library.evaluate(
				(node) => node.scrollWidth <= node.clientWidth + 1,
			),
		).toBe(true);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		await page.screenshot({
			path: info.outputPath(`library-${width}.png`),
			animations: "disabled",
		});
		await library.screenshot({
			path: info.outputPath(`library-region-${width}.png`),
			animations: "disabled",
		});
		await results.focus();
		await page.keyboard.press("End");
		await expect
			.poll(() => results.evaluate((node) => node.scrollTop))
			.toBeGreaterThan(0);
		await page.goto("/?pack=unknown&block=missing%2Fblock&example=9999", {
			waitUntil: "networkidle",
		});
		await expect(page.locator("#pack")).toHaveValue("journal");
		await expect(page.locator("#canonical-block")).toHaveValue(
			"core/feature-grid",
		);
		await expect(
			page.locator(".canonical-canvas .block-not-ready"),
		).toHaveCount(0);
		expect(errors).toEqual([]);
	});
