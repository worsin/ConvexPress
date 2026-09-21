import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
]) {
	test(`utility blocks keep real actions, focus and safe content at ${viewport.width}px`, async ({
		page,
	}, testInfo) => {
		test.setTimeout(120000);
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value: {
					writeText: async (value: string) => {
						document.documentElement.dataset.copiedLink = value;
					},
				},
			});
		});
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
			for (const name of [
				"core/announcement-bar",
				"core/carousel",
				"core/search-box",
				"commerce/search-band",
				"blocks/social-share",
				"core/custom-html",
				"core/trust-badges",
				"core/author-bio",
			]) {
				await page.locator("#canonical-block").selectOption(name);
				const count = await page.locator("#canonical-example option").count();
				await page
					.locator("#canonical-example")
					.selectOption(String(count - 1));
				const canvas = page.locator(".canonical-canvas");
				await expect(canvas).toHaveAttribute("data-canonical-block", name);
				await canvas.scrollIntoViewIfNeeded();
				await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
				await expect(canvas).toBeVisible();
				if (name === "core/announcement-bar") {
					const dismiss = canvas.getByRole("button", {
						name: "Dismiss announcement",
					});
					await expect(dismiss.locator("svg")).toHaveCount(1);
					const closeSize = await dismiss.boundingBox();
					expect(closeSize?.width).toBeGreaterThanOrEqual(44);
					expect(closeSize?.width).toBeLessThanOrEqual(48);
					expect(closeSize?.height).toBeGreaterThanOrEqual(44);
					await dismiss.focus();
					await page.keyboard.press("Enter");
					const restore = canvas.getByRole("button", {
						name: "Show announcement",
					});
					await expect(restore).toBeFocused();
					await expect(canvas.getByRole("link")).toHaveCount(0);
					await page.keyboard.press("Enter");
					await expect(canvas.getByRole("link")).toHaveCount(1);
					await expect(dismiss).toBeFocused();
				}
				if (name === "core/carousel") {
					const visibleSlide = canvas.locator(
						'[aria-roledescription="slide"]:not([hidden])',
					);
					await expect(
						visibleSlide.getByRole("heading", { name: "Clay & light" }),
					).toBeVisible();
					await expect(visibleSlide.getByRole("link")).toHaveAttribute(
						"href",
						"#composition",
					);
					await expect(visibleSlide.locator("img")).toHaveAttribute(
						"alt",
						"Sunlit ceramic studio with cobalt vessels on a workbench",
					);
					const firstSource = await visibleSlide
						.locator("img")
						.getAttribute("src");
					const next = canvas.getByRole("button", { name: "Next slide" });
					await expect(
						canvas.locator('[aria-roledescription="slide"]'),
					).toHaveCount(2);
					await expect(canvas.getByRole("status")).toHaveText("1 / 2");
					await next.focus();
					await page.keyboard.press("Enter");
					await expect(next).toBeFocused();
					await expect(canvas.getByRole("status")).toHaveText("2 / 2");
					await expect(
						visibleSlide.getByRole("heading", { name: "Room to roam" }),
					).toBeVisible();
					await expect(visibleSlide.getByRole("link")).toHaveAttribute(
						"href",
						"#studies",
					);
					await expect(visibleSlide.locator("img")).toHaveAttribute(
						"alt",
						"Field notebook with a mountain landscape cover",
					);
					expect(
						await visibleSlide.locator("img").getAttribute("src"),
					).not.toBe(firstSource);
					await expect
						.poll(() =>
							visibleSlide
								.locator("img")
								.evaluate(
									(node) =>
										node instanceof HTMLImageElement &&
										node.complete &&
										node.naturalWidth > 0,
								),
						)
						.toBe(true);
					await expect(
						canvas.locator('[aria-roledescription="slide"]').first(),
					).toBeHidden();
					await page.keyboard.press("Enter");
					await expect(canvas.getByRole("status")).toHaveText("1 / 2");
					await canvas.getByRole("button", { name: "Previous slide" }).click();
					await expect(canvas.getByRole("status")).toHaveText("2 / 2");
					expect(
						await next.evaluate(
							(node) =>
								!!document.getElementById(
									node.getAttribute("aria-controls") ?? "",
								),
						),
					).toBe(true);
				}
				if (name === "core/search-box" || name === "commerce/search-band") {
					const form = canvas.getByRole("search");
					const input = canvas.getByRole("searchbox");
					await expect(input).toHaveAccessibleName(
						name === "commerce/search-band"
							? "Search products"
							: "Search this site",
					);
					await input.fill("Clay & paper");
					expect(
						await form.evaluate((node) =>
							Object.fromEntries(new FormData(node as HTMLFormElement)),
						),
					).toEqual({ q: "Clay & paper" });
					await expect(form).toHaveAttribute(
						"action",
						name === "commerce/search-band" ? "/products" : "/search",
					);
					await expect(form).toHaveAttribute("method", "get");
					// Capture the browser's native submit path without leaving the isolated harness.
					await form.evaluate((node) =>
						node.addEventListener(
							"submit",
							(event) => {
								event.preventDefault();
								(node as HTMLElement).dataset.submitted = "true";
							},
							{ once: true },
						),
					);
					await input.press("Enter");
					await expect(form).toHaveAttribute("data-submitted", "true");
					if (name === "commerce/search-band") {
						const suggestions = await canvas
							.locator(".cp-library-search-suggestions a")
							.evaluateAll((nodes) =>
								nodes.map((node) => ({
									text: node.textContent,
									href: (node as HTMLAnchorElement).href,
								})),
							);
						expect(suggestions.length).toBe(3);
						for (const item of suggestions) {
							const url = new URL(item.href);
							expect(url.pathname).toBe("/products");
							expect([...url.searchParams.keys()]).toEqual(["q"]);
							expect(url.searchParams.get("q")).toBe(item.text);
						}
					}
				}
				if (name === "blocks/social-share") {
					const target = "https://example.invalid/editorial-study";
					await expect(
						canvas.getByRole("link", { name: "Facebook", exact: true }),
					).toHaveAttribute(
						"href",
						`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(target)}`,
					);
					await canvas
						.getByRole("button", { name: "Copy link", exact: true })
						.click();
					await expect(canvas.getByRole("status")).toHaveText("Link copied.");
					expect(
						await page.locator("html").getAttribute("data-copied-link"),
					).toBe(target);
					await page.evaluate(() =>
						Object.defineProperty(navigator, "clipboard", {
							configurable: true,
							value: {
								writeText: async () => {
									throw new Error("Synthetic clipboard denial");
								},
							},
						}),
					);
					await canvas
						.getByRole("button", { name: "Copy link", exact: true })
						.click();
					await expect(canvas.getByLabel("Link to copy")).toHaveValue(target);
					await expect(canvas.getByRole("status")).toContainText(
						"Copy is unavailable",
					);
					await page.evaluate(() =>
						Object.defineProperty(navigator, "clipboard", {
							configurable: true,
							value: {
								writeText: async (value: string) => {
									document.documentElement.dataset.copiedLink = value;
								},
							},
						}),
					);
				}
				if (name === "core/custom-html") {
					const html = canvas.locator(".cp-library-safe-html");
					await expect(html.locator("h2")).toBeVisible();
					await expect(html.locator("strong")).toBeVisible();
					await expect(
						html.locator(
							"[id],script,iframe,form,input,button,img,[onclick],[style]",
						),
					).toHaveCount(0);
				}
				if (name === "core/trust-badges")
					await expect(canvas.locator("svg")).toHaveCount(3);
				if (name === "core/author-bio") {
					await expect(
						canvas.getByRole("heading", { name: "Rowan Vale" }),
					).toBeVisible();
					await expect(canvas).toContainText("Fictional field journal editor");
					await expect(canvas.locator("img")).toHaveCount(0);
				}
				const geometry = await canvas.evaluate((node) => ({
					width: node.getBoundingClientRect().width,
					height: node.getBoundingClientRect().height,
					client: node.clientWidth,
					scroll: node.scrollWidth,
				}));
				expect(geometry.width).toBeGreaterThan(0);
				expect(geometry.height).toBeGreaterThan(0);
				expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
				const path = testInfo.outputPath(
					`utility-${viewport.width}-${pack}-${name.replaceAll("/", "-")}.png`,
				);
				await page
					.locator(".canonical-gallery")
					.screenshot({ path, animations: "disabled" });
				evidence.push({ pack, name, viewport, geometry, path });
				await writeFile(
					testInfo.outputPath("utility-evidence.json"),
					JSON.stringify(evidence, null, 2),
				);
			}
		}
		expect(errors).toEqual([]);
		await testInfo.attach("utility-evidence.json", {
			path: testInfo.outputPath("utility-evidence.json"),
			contentType: "application/json",
		});
	});
}
