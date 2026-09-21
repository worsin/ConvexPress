import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
]) {
	test(`media details controls, lightbox and reduced motion at ${viewport.width}px`, async ({
		page,
	}, testInfo) => {
		test.setTimeout(120000);
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		const evidence: unknown[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		const packs = await page
			.locator("#pack option")
			.evaluateAll((nodes) =>
				nodes.map((node) => (node as HTMLOptionElement).value),
			);
		const canvas = page.locator(".canonical-canvas");
		async function select(name: string) {
			await page.locator("#canonical-block").selectOption(name);
			const count = await page.locator("#canonical-example option").count();
			await page.locator("#canonical-example").selectOption(String(count - 1));
			await expect(canvas).toHaveAttribute("data-canonical-block", name);
			await canvas.scrollIntoViewIfNeeded();
			await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
		}
		async function capture(pack: string, name: string, details: unknown) {
			const path = testInfo.outputPath(
				`media-details-${viewport.width}-${pack}-${name.replaceAll("/", "-")}.png`,
			);
			await page
				.locator(".canonical-gallery")
				.screenshot({ path, animations: "disabled" });
			evidence.push({ pack, viewport, name, details, path });
			await writeFile(
				testInfo.outputPath("media-details-evidence.json"),
				JSON.stringify(evidence, null, 2),
			);
		}
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			await select("core/hero-video");
			const video = canvas.locator("video");
			await expect(video).toHaveCount(1);
			const media = await video.evaluate((node) => {
				if (!(node instanceof HTMLVideoElement))
					throw new Error("Expected native video");
				return {
					controls: node.controls,
					autoplay: node.autoplay,
					paused: node.paused,
					src: node.getAttribute("src"),
					poster: node.getAttribute("poster"),
					width: node.getBoundingClientRect().width,
				};
			});
			expect(media.controls).toBe(true);
			expect(media.autoplay).toBe(false);
			expect(media.paused).toBe(true);
			expect(media.width).toBeGreaterThan(0);
			expect(media.src).toContain("workshop-fixture");
			expect(media.poster).toBeTruthy();
			expect(media.poster).not.toBe(media.src);
			await capture(pack, "core/hero-video", media);
			await select("core/lightbox-grid");
			const trigger = canvas.getByRole("button", { name: /^View / }).first();
			await trigger.click();
			const dialog = canvas.getByRole("dialog");
			await expect(dialog).toBeVisible();
			const first = await dialog.locator("img").getAttribute("src");
			await dialog
				.getByRole("button", { name: "Next image", exact: true })
				.click();
			const second = await dialog.locator("img").getAttribute("src");
			expect(second).not.toBe(first);
			for (let index = 0; index < 7; index++) {
				await page.keyboard.press("Tab");
				expect(
					await dialog.evaluate((node) =>
						node.contains(document.activeElement),
					),
				).toBe(true);
			}
			for (let index = 0; index < 7; index++) {
				await page.keyboard.press("Shift+Tab");
				expect(
					await dialog.evaluate((node) =>
						node.contains(document.activeElement),
					),
				).toBe(true);
			}
			await page.keyboard.press("Escape");
			await expect(dialog).not.toBeVisible();
			await expect(trigger).toBeFocused();
			await capture(pack, "core/lightbox-grid", {
				first,
				second,
				keyboardBoundary: true,
			});
			await select("core/marquee");
			const wrapper = canvas.locator(".cp-library-rich-marquee");
			const track = wrapper.locator(".cp-library-rich-marquee-track");
			await expect(
				wrapper.getByRole("button", { name: "Motion reduced" }),
			).toBeDisabled();
			await expect(wrapper.getByRole("link")).toHaveCount(3);
			await expect(wrapper.locator("ul[aria-hidden=true]")).not.toBeVisible();
			await page.emulateMedia({ reducedMotion: "no-preference" });
			const play = wrapper.getByRole("button", { name: "Play motion" });
			await expect(play).toBeEnabled();
			await expect(wrapper).toHaveAttribute("data-playing", "false");
			await play.click();
			await page.mouse.move(0, 0);
			await expect
				.poll(() =>
					track.evaluate((node) => getComputedStyle(node).animationPlayState),
				)
				.toBe("running");
			await expect
				.poll(() => track.evaluate((node) => getComputedStyle(node).transform))
				.not.toBe("none");
			await wrapper.getByRole("link").first().focus();
			await expect
				.poll(() =>
					track.evaluate((node) => getComputedStyle(node).animationPlayState),
				)
				.toBe("paused");
			await wrapper.getByRole("button", { name: "Pause motion" }).click();
			await expect(wrapper).toHaveAttribute("data-playing", "false");
			await page.emulateMedia({ reducedMotion: "reduce" });
			await expect(
				wrapper.getByRole("button", { name: "Motion reduced" }),
			).toBeDisabled();
			expect(
				await track.evaluate((node) => getComputedStyle(node).animationName),
			).toBe("none");
			await capture(pack, "core/marquee", {
				pausedByDefault: true,
				focusPauses: true,
				reduced: true,
				accessibleLinks: 3,
			});
			await select("core/countdown");
			const digits = canvas.getByRole("definition");
			await expect(digits).toHaveCount(4);
			await expect(canvas.locator("time")).toHaveAttribute(
				"datetime",
				"2040-06-01T09:00:00.000Z",
			);
			expect(
				await canvas
					.locator(".cp-library-countdown")
					.evaluate((node) => node.closest("[aria-live]") === null),
			).toBe(true);
			await expect(canvas.getByRole("status")).toBeEmpty();
			await expect(canvas.getByRole("link")).toHaveAttribute(
				"href",
				"#studies",
			);
			const clock = await canvas
				.locator(".cp-library-countdown")
				.evaluate((node) => ({
					width: node.clientWidth,
					scrollWidth: node.scrollWidth,
					animations: node.getAnimations({ subtree: true }).length,
				}));
			expect(clock.width).toBeGreaterThan(0);
			expect(clock.scrollWidth).toBeLessThanOrEqual(clock.width + 1);
			expect(clock.animations).toBe(0);
			await capture(pack, "core/countdown", clock);
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true);
		}
		expect(errors).toEqual([]);
		await testInfo.attach("media-details-evidence.json", {
			path: testInfo.outputPath("media-details-evidence.json"),
			contentType: "application/json",
		});
	});
}
