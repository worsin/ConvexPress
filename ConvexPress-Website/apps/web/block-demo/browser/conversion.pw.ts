import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
])
	test(`map, provider IDs and truthful subscription states at ${viewport.width}px`, async ({
		page,
	}, testInfo) => {
		test.setTimeout(120000);
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		const mutations: string[] = [];
		page.on("request", (request) => {
			if (new URL(request.url()).hostname.endsWith(".convex.cloud"))
				mutations.push(request.url());
		});
		await page.route(
			/^https:\/\/(?:www\.youtube-nocookie\.com|player\.vimeo\.com|www\.openstreetmap\.org)\//,
			(route) =>
				route.fulfill({
					status: 200,
					contentType: "text/html",
					body: "<!doctype html><title>Local provider frame</title><p>Local intercepted provider frame. No playback claim.</p>",
				}),
		);
		await page.goto("/", { waitUntil: "networkidle" });
		const packs = await page
			.locator("#pack option")
			.evaluateAll((nodes) =>
				nodes.map((node) => (node as HTMLOptionElement).value),
			);
		const evidence: unknown[] = [];
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			for (const item of [
				{ name: "core/map", example: -1, provider: "OpenStreetMap" },
				{ name: "core/script-embed", example: 1, provider: "Vimeo" },
				{ name: "core/script-embed", example: 2, provider: "YouTube" },
				{ name: "core/newsletter-signup", example: -1, provider: null },
				{ name: "core/cta-with-form", example: -1, provider: null },
			]) {
				await page.locator("#canonical-block").selectOption(item.name);
				const count = await page.locator("#canonical-example option").count();
				await page
					.locator("#canonical-example")
					.selectOption(String(item.example < 0 ? count - 1 : item.example));
				const canvas = page.locator(".canonical-canvas");
				await canvas.scrollIntoViewIfNeeded();
				await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
				const result = item.provider
					? canvas
					: canvas.locator(".newsletter-demo-result");
				const geometry = await result.evaluate((node) => ({
					width: node.getBoundingClientRect().width,
					height: node.getBoundingClientRect().height,
					client: node.clientWidth,
					scroll: node.scrollWidth,
				}));
				expect(geometry.width).toBeGreaterThan(0);
				expect(geometry.height).toBeGreaterThan(0);
				expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth,
					),
				).toBe(true);
				const path = testInfo.outputPath(
					`conversion-${viewport.width}-${pack}-${item.name.replaceAll("/", "-")}-${item.provider ?? "signup"}.png`,
				);
				await result.screenshot({ path, animations: "disabled" });
				if (item.provider) {
					await expect(result.locator("iframe")).toHaveCount(0);
					if (item.name === "core/map") {
						await expect(result.locator("address")).toContainText(
							"Illustrative coordinates",
						);
						await expect(
							result.getByRole("link", { name: "Open on OpenStreetMap" }),
						).toHaveAttribute("href", /mlat=40\.72&mlon=-111\.61/);
						await expect(
							result.getByRole("link", {
								name: "Open directions to the sample point",
							}),
						).toHaveAttribute(
							"href",
							"https://www.openstreetmap.org/directions?to=40.72%2C-111.61",
						);
					}
					const trigger = result.getByRole("button", {
						name: item.name === "core/map" ? "Load map" : "Load video",
						exact: true,
					});
					await trigger.focus();
					await page.keyboard.press("Enter");
					const frame = result.locator("iframe");
					await expect(frame).toBeFocused();
					await expect(frame).toHaveAttribute(
						"sandbox",
						"allow-scripts allow-same-origin",
					);
					await expect(frame).toHaveAttribute("title", /.+/);
					expect(await frame.getAttribute("allow")).not.toContain("autoplay");
					if (item.provider === "Vimeo")
						await expect(frame).toHaveAttribute(
							"src",
							"https://player.vimeo.com/video/76979871?autoplay=0&dnt=1",
						);
					if (item.provider === "YouTube")
						await expect(frame).toHaveAttribute(
							"src",
							"https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=0&controls=1",
						);
					await result
						.getByRole("button", { name: "Unload embedded content" })
						.click();
					await expect(frame).toHaveCount(0);
					await expect(trigger).toBeFocused();
				} else {
					const mode = canvas.locator("[data-newsletter-mode]");
					const input = result.getByRole("textbox", { name: "Email address" });
					const submit = result.getByRole("button");
					await expect(input).toBeDisabled();
					await expect(submit).toBeDisabled();
					await expect(result).toContainText("not connected");
					await mode.selectOption("error");
					await expect(input).toBeEnabled();
					await input.fill("invalid");
					await submit.click();
					expect(
						await input.evaluate(
							(node) => (node as HTMLInputElement).validity.valid,
						),
					).toBe(false);
					await expect(result).not.toContainText("Could not confirm");
					await input.fill("reader@example.invalid");
					await input.press("Enter");
					await expect(result).toContainText(
						"Could not confirm your subscription",
					);
					await expect(input).toHaveValue("reader@example.invalid");
					await expect(submit).toBeEnabled();
					await expect(input).toBeFocused();
					await expect(result).not.toContainText("Check your inbox");
					await mode.selectOption("pending");
					await expect(input).toHaveValue("");
					await input.fill("reader@example.invalid");
					await input.press("Enter");
					await expect(result.locator("form")).toHaveAttribute(
						"aria-busy",
						"true",
					);
					await expect(submit).toBeDisabled();
					await expect(result).toContainText("Saving your subscription");
					await mode.selectOption("disconnected");
					await expect(input).toHaveValue("");
					await expect(result.locator("form")).toHaveAttribute(
						"aria-busy",
						"false",
					);
					await expect(result).not.toContainText("You’re on the list");
				}
				evidence.push({
					pack,
					block: item.name,
					provider: item.provider,
					viewport,
					geometry,
					path,
					actionProof: item.provider
						? "local intercepted provider frame"
						: "local failure/pending only; no fabricated success",
				});
			}
		}
		expect(errors).toEqual([]);
		expect(mutations).toEqual([]);
		expect(evidence).toHaveLength(packs.length * 5);
		const path = testInfo.outputPath(
			`conversion-boundaries-${viewport.width}.json`,
		);
		await writeFile(path, JSON.stringify(evidence, null, 2));
		await testInfo.attach("conversion-boundaries", {
			path,
			contentType: "application/json",
		});
	});
