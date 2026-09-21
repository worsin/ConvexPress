import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

// Frames are deliberately fulfilled locally. This gate proves consent, browser
// sandbox configuration and pack layout, not provider availability or booking.
for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
]) {
	test(`contact and reviewed embeds keep consent and keyboard control at ${viewport.width}px`, async ({
		page,
	}, testInfo) => {
		test.setTimeout(120000);
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		const connections: string[] = [];
		await page.route(
			/^https:\/\/(?:www\.youtube-nocookie\.com|player\.vimeo\.com|www\.openstreetmap\.org|calendly\.com)\//,
			async (route) => {
				connections.push(route.request().url());
				await route.fulfill({
					status: 200,
					contentType: "text/html",
					body: '<!doctype html><html lang="en"><title>Local embed boundary fixture</title><body style="font:18px/1.5 system-ui;padding:24px"><p>Local frame fixture. No external provider was contacted.</p><button type="button">Fixture focus target</button></body></html>',
				});
			},
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
			for (const specimen of [
				{
					name: "blocks/contact-stack",
					kind: "map",
					provider: "OpenStreetMap",
					label: "Load map",
				},
				{
					name: "core/booking-cta",
					kind: "scheduler",
					provider: "Calendly",
					label: "Load booking calendar",
				},
				{
					name: "core/embed",
					kind: "video",
					provider: "YouTube",
					label: "Load video",
				},
				{
					name: "core/iframe",
					kind: "map",
					provider: "OpenStreetMap",
					label: "Load map",
				},
			]) {
				const before = connections.length;
				await page.locator("#canonical-block").selectOption(specimen.name);
				const count = await page.locator("#canonical-example option").count();
				await page
					.locator("#canonical-example")
					.selectOption(String(count - 1));
				const canvas = page.locator(".canonical-canvas");
				await expect(canvas).toHaveAttribute(
					"data-canonical-block",
					specimen.name,
				);
				await canvas.scrollIntoViewIfNeeded();
				await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
				const embed = canvas.locator(".cp-library-embed");
				await expect(embed).toBeVisible();
				await expect(embed).toHaveAttribute("data-kind", specimen.kind);
				await expect(embed.locator("iframe")).toHaveCount(0);
				await expect(embed.locator(".cp-library-embed-stage")).toHaveAttribute(
					"data-loaded",
					"false",
				);
				expect(connections.length).toBe(before);
				const load = embed.getByRole("button", {
					name: specimen.label,
					exact: true,
				});
				const bounds = await load.boundingBox();
				expect(bounds?.height).toBeGreaterThanOrEqual(44);
				const geometry = await canvas.evaluate((node) => ({
					width: node.getBoundingClientRect().width,
					height: node.getBoundingClientRect().height,
					client: node.clientWidth,
					scroll: node.scrollWidth,
				}));
				expect(geometry.width).toBeGreaterThan(0);
				expect(geometry.height).toBeGreaterThan(0);
				expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
				// A clipped consent control can remain "visible" to accessibility
				// queries. Verify actual containment, not only positive bounds.
				const consentGeometry = await embed.evaluate((node) => {
					const stage = node.querySelector(".cp-library-embed-stage")!;
					const box = (element: Element) => {
						const rect = element.getBoundingClientRect();
						return {
							left: rect.left,
							right: rect.right,
							top: rect.top,
							bottom: rect.bottom,
						};
					};
					return {
						stage: box(stage),
						content: [
							...stage.querySelectorAll(".cp-library-embed-consent > *"),
						].map(box),
						overflow: getComputedStyle(stage).overflow,
					};
				});
				expect(consentGeometry.overflow).toBe("visible");
				for (const box of consentGeometry.content) {
					expect(box.left).toBeGreaterThanOrEqual(
						consentGeometry.stage.left - 1,
					);
					expect(box.right).toBeLessThanOrEqual(
						consentGeometry.stage.right + 1,
					);
					expect(box.top).toBeGreaterThanOrEqual(consentGeometry.stage.top - 1);
					expect(box.bottom).toBeLessThanOrEqual(
						consentGeometry.stage.bottom + 1,
					);
				}
				const css = await load.evaluate((node) => ({
					transition: getComputedStyle(node).transitionDuration,
					transform: getComputedStyle(node).transform,
				}));
				expect(css.transition).toBe("0s");
				expect(css.transform).toBe("none");
				const slug = specimen.name.replaceAll("/", "-");
				const consentPath = testInfo.outputPath(
					`contact-${viewport.width}-${pack}-${slug}.png`,
				);
				await canvas.screenshot({ path: consentPath, animations: "disabled" });
				await load.focus();
				await page.keyboard.press("Enter");
				const frame = embed.locator("iframe");
				await expect(frame).toHaveCount(1);
				await expect(embed.locator(".cp-library-embed-stage")).toHaveAttribute(
					"data-loaded",
					"true",
				);
				await expect(frame).toBeFocused();
				await expect.poll(() => connections.length).toBe(before + 1);
				await expect(frame).toHaveAttribute("title", /.+/);
				await expect(frame).toHaveAttribute(
					"sandbox",
					specimen.kind === "scheduler"
						? "allow-scripts allow-same-origin allow-forms"
						: "allow-scripts allow-same-origin",
				);
				await expect(frame).toHaveAttribute(
					"referrerpolicy",
					"strict-origin-when-cross-origin",
				);
				expect(await frame.getAttribute("srcdoc")).toBe(null);
				expect(await frame.getAttribute("allow")).not.toContain("autoplay");
				const frameBounds = await frame.boundingBox();
				expect(frameBounds?.width).toBeGreaterThanOrEqual(
					specimen.kind === "scheduler" ? 320 : 200,
				);
				expect(frameBounds?.height).toBeGreaterThanOrEqual(200);
				const localTarget = embed
					.frameLocator("iframe")
					.getByRole("button", { name: "Fixture focus target" });
				await expect(localTarget).toBeVisible();
				await localTarget.focus();
				await expect(localTarget).toBeFocused();
				const unload = embed.getByRole("button", {
					name: "Unload embedded content",
				});
				await unload.focus();
				await page.keyboard.press("Enter");
				await expect(frame).toHaveCount(0);
				await expect(load).toBeFocused();
				await expect(
					embed.getByRole("link", { name: `Open on ${specimen.provider}` }),
				).toHaveAttribute("target", "_blank");
				if (specimen.name === "blocks/contact-stack") {
					const contactLayout = await canvas
						.locator(".cp-library-contact-stack")
						.evaluate((node) => {
							const copy = node
								.querySelector(".cp-library-contact-stack-copy")!
								.getBoundingClientRect();
							const map = node
								.querySelector(".cp-library-embed")!
								.getBoundingClientRect();
							return {
								copy: { width: copy.width, bottom: copy.bottom },
								map: { width: map.width, top: map.top },
								rows: [...node.querySelectorAll("dd")].map(
									(value) => value.getBoundingClientRect().width,
								),
							};
						});
					if (viewport.width < 900) {
						expect(contactLayout.copy.width).toBeGreaterThan(280);
						expect(contactLayout.map.top).toBeGreaterThanOrEqual(
							contactLayout.copy.bottom,
						);
						for (const width of contactLayout.rows)
							expect(width).toBeGreaterThan(250);
					} else {
						expect(contactLayout.map.top).toBeLessThan(
							contactLayout.copy.bottom,
						);
					}
					await expect(
						canvas.getByRole("link", { name: "+1 (202) 555-0142" }),
					).toHaveAttribute("href", "tel:+12025550142");
					await expect(
						canvas.getByRole("link", { name: "hello@example.invalid" }),
					).toHaveAttribute("href", "mailto:hello@example.invalid");
					await expect(canvas.locator("address")).toContainText(
						"Illustrative mountain-retreat address",
					);
				}
				if (specimen.name === "core/booking-cta") {
					await expect(
						canvas.getByRole("link", { name: "Explore the workshop" }),
					).toHaveAttribute("href", "/#composition");
					await expect(canvas).toContainText(
						"no appointment is offered or confirmed",
					);
				}
				evidence.push({
					pack,
					name: specimen.name,
					viewport,
					geometry,
					consentGeometry,
					frameBounds,
					consentPath,
					providerMode:
						"local intercepted frame; external availability unverified",
				});
			}
		}
		expect(errors).toEqual([]);
		expect(evidence).toHaveLength(packs.length * 4);
		const path = testInfo.outputPath(
			`contact-embed-boundaries-${viewport.width}.json`,
		);
		await writeFile(path, JSON.stringify(evidence, null, 2));
		await testInfo.attach("contact-embed-boundaries", {
			path,
			contentType: "application/json",
		});
	});
}
