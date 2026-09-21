import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
]) {
	test(`editorial tabs preserve media, focus and two-instance associations at ${viewport.width}px`, async ({
		page,
	}, testInfo) => {
		test.setTimeout(120000);
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
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
			for (const name of ["blocks/tabbed-content", "core/feature-tabs"]) {
				await page.locator("#canonical-block").selectOption(name);
				const count = await page.locator("#canonical-example option").count();
				await page
					.locator("#canonical-example")
					.selectOption(String(count - 1));
				const canvas = page.locator(".canonical-canvas");
				await expect(canvas).toHaveAttribute("data-canonical-block", name);
				await canvas.scrollIntoViewIfNeeded();
				await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
				const tabs = canvas.getByRole("tab");
				await expect(tabs).toHaveCount(3);
				await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
				const firstImage = await canvas
					.getByRole("tabpanel")
					.locator("img")
					.getAttribute("src");
				await tabs.first().focus();
				await page.keyboard.press("ArrowLeft");
				await expect(tabs.nth(2)).toBeFocused();
				await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
				await page.keyboard.press("ArrowRight");
				await expect(tabs.first()).toBeFocused();
				await page.keyboard.press("End");
				await expect(tabs.nth(2)).toBeFocused();
				await page.keyboard.press("Home");
				await expect(tabs.first()).toBeFocused();
				if (name === "core/feature-tabs")
					await expect(
						canvas.getByRole("tabpanel").locator("strong"),
					).toHaveText("Look closely. ");
				await page.keyboard.press("ArrowRight");
				await expect(tabs.nth(1)).toBeFocused();
				const activePanel = canvas.getByRole("tabpanel");
				await expect(activePanel).toHaveCount(1);
				await expect(activePanel).toBeVisible();
				const secondImage = await activePanel
					.locator("img")
					.getAttribute("src");
				expect(secondImage).toBeTruthy();
				expect(firstImage).not.toBe(secondImage);
				await expect
					.poll(() =>
						activePanel
							.locator("img")
							.evaluate((image) => (image as HTMLImageElement).naturalWidth),
					)
					.toBeGreaterThan(0);
				await page.keyboard.press("Tab");
				await expect(activePanel).toBeFocused();
				const associations = await canvas
					.locator(".cp-editorial-tabs")
					.evaluate((group) => {
						const buttons = [
							...group.querySelectorAll<HTMLElement>('[role="tab"]'),
						];
						return buttons.map((button) => {
							const panel = document.getElementById(
								button.getAttribute("aria-controls") || "",
							);
							const box = button.getBoundingClientRect();
							return {
								id: button.id,
								controls: panel?.id,
								labelledBy: panel?.getAttribute("aria-labelledby"),
								hidden: (panel as HTMLElement)?.hidden,
								selected: button.getAttribute("aria-selected"),
								tabIndex: button.tabIndex,
								width: box.width,
								height: box.height,
							};
						});
					});
				expect(associations.filter((item) => item.tabIndex === 0)).toHaveLength(
					1,
				);
				for (const item of associations) {
					expect(item.labelledBy).toBe(item.id);
					expect(item.hidden).toBe(item.selected !== "true");
					expect(item.width).toBeGreaterThan(0);
					expect(item.height).toBeGreaterThanOrEqual(44);
				}
				// Open the existing local authoring preview to mount a second real block instance.
				const authoring = page.locator(".canonical-authoring");
				await authoring.locator(":scope > summary").click();
				await expect(authoring).toHaveAttribute("open", "");
				const second = page.locator(
					'[data-authoring-preview="canvas"] .cp-editorial-tabs',
				);
				await expect(second).toBeVisible();
				await expect(second.getByRole("tab").first()).toHaveAttribute(
					"aria-selected",
					"true",
				);
				const ids = await page
					.locator(".cp-editorial-tabs [id]")
					.evaluateAll((nodes) => nodes.map((node) => node.id));
				expect(new Set(ids).size).toBe(ids.length);
				await second.getByRole("tab").nth(2).click();
				await expect(second.getByRole("tab").nth(2)).toHaveAttribute(
					"aria-selected",
					"true",
				);
				await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
				await authoring.locator(":scope > summary").click();
				await expect(authoring).not.toHaveAttribute("open");
				await canvas.scrollIntoViewIfNeeded();
				const motion = await activePanel.evaluate((panel) => ({
					animations: panel.getAnimations().length,
					transitionDuration: getComputedStyle(panel).transitionDuration,
					scrollWidth: panel.scrollWidth,
					width: panel.clientWidth,
				}));
				expect(motion.animations).toBe(0);
				expect(motion.transitionDuration).toBe("0s");
				expect(motion.scrollWidth).toBeLessThanOrEqual(motion.width + 1);
				const path = testInfo.outputPath(
					`editorial-${viewport.width}-${pack}-${name.replaceAll("/", "-")}.png`,
				);
				await page
					.locator(".canonical-gallery")
					.screenshot({ path, animations: "disabled" });
				evidence.push({
					pack,
					name,
					viewport,
					associations,
					firstImage,
					secondImage,
					motion,
					path,
				});
				await writeFile(
					testInfo.outputPath("editorial-tabs-evidence.json"),
					JSON.stringify(
						{
							scope:
								"Two editorial tab renderers within the58 source inventory",
							evidence,
						},
						null,
						2,
					),
				);
			}
		}
		expect(errors).toEqual([]);
		await testInfo.attach("editorial-tabs-evidence.json", {
			path: testInfo.outputPath("editorial-tabs-evidence.json"),
			contentType: "application/json",
		});
	});
}
