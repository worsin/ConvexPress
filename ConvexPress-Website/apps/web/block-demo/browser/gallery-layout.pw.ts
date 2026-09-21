import { expect, test } from "@playwright/test";

const caption = "A hand-thrown cup, shaped slowly in our small workshop. "
	.repeat(18)
	.slice(0, 1000);
for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 600 },
	{ width: 844, height: 390 },
]) {
	test(`gallery preview retains controls with long captions · ${viewport.width}`, async ({
		page,
	}, info) => {
		test.setTimeout(90000);
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		for (const pack of ["core", "journal", "depot", "aster-house"]) {
			await page.locator("#pack").selectOption(pack);
			for (const block of ["core/gallery", "core/lightbox-grid"]) {
				await page.locator("#canonical-block").selectOption(block);
				await page.locator("#canonical-example").selectOption("1");
				const disclosure = page.locator(".canonical-authoring");
				if ((await disclosure.getAttribute("open")) === null)
					await disclosure.locator(":scope > summary").click();
				const study = page.getByRole("region", {
					name: "Local block authoring preview",
				});
				await study
					.getByRole("textbox", { name: "Caption", exact: true })
					.first()
					.fill(caption);
				const trigger = study.getByRole("button", {
					name: `View ${caption}`,
					exact: true,
				});
				await trigger.click();
				const dialog = study.getByRole("dialog");
				await expect(dialog).toBeVisible();
				await expect(dialog.locator("figcaption")).toHaveText(caption);
				await dialog.locator("img").evaluate((image) => {
					if (!(image instanceof HTMLImageElement))
						throw new Error("Expected gallery image");
					return image.decode();
				});
				await page.evaluate(() => document.fonts.ready);
				const controlsFit = async () => {
					expect(
						await dialog.evaluate((node) => {
							const box = node.getBoundingClientRect();
							return [...node.querySelectorAll("button")].every((button) => {
								const rect = button.getBoundingClientRect();
								return (
									rect.top >= Math.max(0, box.top) &&
									rect.bottom <= Math.min(innerHeight, box.bottom) &&
									rect.left >= box.left &&
									rect.right <= box.right &&
									rect.height >= 44
								);
							});
						}),
						`${pack}/${block}: close and image navigation stay visible`,
					).toBe(true);
				};
				await controlsFit();
				const content = dialog.locator(".cp-library-lightbox-content");
				await content.focus();
				const scrollWithKey = async (key: string) => {
					await content.evaluate((node) => {
						node.dataset.scrollSettled = "false";
						node.addEventListener(
							"scrollend",
							() => {
								node.dataset.scrollSettled = "true";
							},
							{ once: true },
						);
					});
					await page.keyboard.press(key);
					await expect(content).toHaveAttribute("data-scroll-settled", "true");
				};
				await scrollWithKey("End");
				expect(
					await content.evaluate(
						(node) => node.scrollHeight - node.clientHeight - node.scrollTop,
					),
				).toBeLessThanOrEqual(1);
				await controlsFit();
				await scrollWithKey("Home");
				expect(await content.evaluate((node) => node.scrollTop)).toBe(0);
				await dialog.screenshot({
					path: info.outputPath(
						`${pack}-${block.split("/")[1]}-${viewport.width}.png`,
					),
					animations: "disabled",
				});
				await dialog
					.getByRole("button", { name: "Next image", exact: true })
					.click();
				await expect(dialog.locator("figcaption")).not.toHaveText(caption);
				await controlsFit();
				await page.keyboard.press("Escape");
				await expect(dialog).not.toBeVisible();
				await expect(trigger).toBeFocused();
				await trigger.press("Enter");
				await expect(dialog).toBeVisible();
				await dialog.getByRole("button", { name: /^Close preview/ }).click();
				await expect(trigger).toBeFocused();
			}
		}
		expect(errors).toEqual([]);
	});
}
