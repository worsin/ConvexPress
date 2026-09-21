import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
test("testimonial names and roles have distinct readable lines under every pack", async ({
	page,
}, testInfo) => {
	test.setTimeout(120000);
	const spec = JSON.parse(
		await readFile(
			new URL(
				"../../../../../blocks/core/testimonial-wall/block.json",
				import.meta.url,
			),
			"utf8",
		),
	);
	const expected = spec.examples.at(-1).items as {
		name: string;
		context: string;
	}[];
	const evidence: unknown[] = [];
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.emulateMedia({ reducedMotion: "reduce" });
	for (const viewport of [
		{ width: 1440, height: 1000 },
		{ width: 390, height: 844 },
	]) {
		await page.setViewportSize(viewport);
		await page.goto("/", { waitUntil: "networkidle" });
		const packs = await page
			.locator("#pack option")
			.evaluateAll((nodes) =>
				nodes.map((node) => (node as HTMLOptionElement).value),
			);
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			await page
				.locator("#canonical-block")
				.selectOption("core/testimonial-wall");
			const count = await page.locator("#canonical-example option").count();
			await page.locator("#canonical-example").selectOption(String(count - 1));
			const canvas = page.locator(".canonical-canvas");
			await canvas.scrollIntoViewIfNeeded();
			await expect(canvas).toHaveAttribute(
				"data-canonical-block",
				"core/testimonial-wall",
			);
			await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
			await page.evaluate(() => document.fonts.ready);
			const captions = canvas.locator(
				".cp-editorial-testimonial-wall figcaption",
			);
			await expect(captions).toHaveCount(expected.length);
			for (const caption of await captions.all())
				await expect(caption).toBeVisible();
			const geometry = await captions.evaluateAll((nodes) =>
				nodes.map((caption) => {
					const nameNode = [...caption.childNodes].find(
						(node) =>
							node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
					);
					if (!nameNode) throw new Error("Testimonial name text is absent");
					const range = document.createRange();
					range.selectNodeContents(nameNode);
					const nameBox = range.getBoundingClientRect();
					const role = caption.querySelector("cite");
					if (!role) throw new Error("Authored role is absent");
					const roleBox = role.getBoundingClientRect();
					const style = getComputedStyle(caption);
					const roleStyle = getComputedStyle(role);
					return {
						name: nameNode.textContent?.trim(),
						role: role.textContent?.trim(),
						nameWidth: nameBox.width,
						nameBottom: nameBox.bottom,
						roleY: roleBox.top,
						roleWidth: roleBox.width,
						nameWeight: parseInt(style.fontWeight, 10),
						roleWeight: parseInt(roleStyle.fontWeight, 10),
						nameSize: parseFloat(style.fontSize),
						roleSize: parseFloat(roleStyle.fontSize),
						roleFontStyle: roleStyle.fontStyle,
						width: (caption as HTMLElement).clientWidth,
						scrollWidth: (caption as HTMLElement).scrollWidth,
					};
				}),
			);
			for (const [index, item] of geometry.entries()) {
				expect(item.name).toBe(expected[index].name);
				expect(item.role).toBe(expected[index].context);
				expect(item.role).toContain("Fictional");
				expect(item.nameWidth).toBeGreaterThan(0);
				expect(item.roleWidth).toBeGreaterThan(0);
				expect(item.roleY).toBeGreaterThan(item.nameBottom + 3);
				expect(item.nameWeight).toBeGreaterThan(item.roleWeight);
				expect(item.nameSize).toBeGreaterThan(item.roleSize);
				expect(item.roleFontStyle).toBe("normal");
				expect(item.scrollWidth).toBeLessThanOrEqual(item.width + 1);
			}
			const path = testInfo.outputPath(
				`testimonial-${viewport.width}-${pack}.png`,
			);
			await page
				.locator(".canonical-gallery")
				.screenshot({ path, animations: "disabled" });
			evidence.push({ pack, viewport, geometry, path });
			await writeFile(
				testInfo.outputPath("testimonial-attribution-evidence.json"),
				JSON.stringify(evidence, null, 2),
			);
		}
	}
	expect(errors).toEqual([]);
	await testInfo.attach("testimonial-attribution-evidence.json", {
		path: testInfo.outputPath("testimonial-attribution-evidence.json"),
		contentType: "application/json",
	});
});
