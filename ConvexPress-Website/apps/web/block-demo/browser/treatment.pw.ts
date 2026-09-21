import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
test("editorial treatment retains original finite axes under every pack and width", async ({
	page,
}, testInfo) => {
	test.setTimeout(120000);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/", { waitUntil: "networkidle" });
	const evidence = [];
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: 1000 });
		for (const pack of ["core", "journal", "depot", "aster-house"]) {
			await page.locator("#pack").selectOption(pack);
			const study = page.locator("[data-treatment-study]");
			await study.locator("summary").click();
			await study.scrollIntoViewIfNeeded();
			for (let spacing = 0; spacing <= 8; spacing++) {
				const alignment = ["left", "center", "right"][spacing % 3],
					ink = ["foreground", "primary", "muted"][spacing % 3],
					font = spacing % 2 ? "body" : "display";
				for (const [control, value] of Object.entries({
					Spacing: String(spacing),
					Alignment: alignment,
					Ink: ink,
					Font: font,
				}))
					await study
						.locator(`[data-treatment-control="${control}"]`)
						.selectOption(value);
				const values = await study.evaluate((node) => {
					const old = node.querySelector(
							"[data-treatment-original] > section > section",
						)!,
						next = node.querySelector(".cp-field-guide-treatment > .cp-stack")!;
					const read = (root: Element) => {
						const head = root.querySelector("h2")!,
							body = root.querySelector("p")!;
						const bounds = root.getBoundingClientRect();
						const geometry = (element: Element | Range) => {
							const rect = element.getBoundingClientRect();
							return [rect.x - bounds.x, rect.y - bounds.y, rect.width, rect.height];
						};
						const link = root.querySelector("a")!;
						const linkText = document.createRange();
						linkText.selectNodeContents(link);
						return {
							width: root.getBoundingClientRect().width,
							geometry: [head, body, root.querySelector("dl")!, link, linkText].map(geometry),
							gap: getComputedStyle(root).gap,
							align: getComputedStyle(root).textAlign,
							color: getComputedStyle(root).color,
							heading: {
								size: getComputedStyle(head).fontSize,
								line: getComputedStyle(head).lineHeight,
								font: getComputedStyle(head).fontFamily,
								transform: getComputedStyle(head).textTransform,
							},
							body: {
								line: getComputedStyle(body).lineHeight,
								text: body.textContent,
							},
							terms: [...root.querySelectorAll("dt,dd")].map(
								(item) => item.textContent,
							),
						};
					};
					return {
						old: read(old),
						next: read(next),
						overflow: document.documentElement.scrollWidth > innerWidth,
					};
				});
				expect(values.old.width).toBeGreaterThan(0);
				expect(values.next.width).toBeGreaterThan(0);
				expect(values.next.width).toBeCloseTo(values.old.width, 1);
				for (let element = 0; element < values.old.geometry.length; element++)
					for (let axis = 0; axis < 4; axis++)
						expect(values.next.geometry[element][axis]).toBeCloseTo(values.old.geometry[element][axis], 1);
				expect(values.overflow).toBe(false);
				expect(parseFloat(values.next.gap)).toBe(spacing * 4);
				expect(values.next.gap).toBe(values.old.gap);
				expect(values.next.align).toBe(values.old.align);
				expect(values.next.color).toBe(values.old.color);
				expect(values.next.heading).toEqual(values.old.heading);
				expect(values.next.body).toEqual(values.old.body);
				expect(values.next.terms).toEqual(values.old.terms);
				evidence.push({
					width,
					pack,
					spacing,
					alignment,
					ink,
					font,
					...values,
				});
			}
			await study.screenshot({
				path: testInfo.outputPath(`editorial-treatment-${width}-${pack}.png`),
				animations: "disabled",
			});
		}
	}
	expect(errors).toEqual([]);
	const path = testInfo.outputPath("editorial-treatment-parity.json");
	await writeFile(path, JSON.stringify(evidence, null, 2));
	await testInfo.attach("editorial treatment parity", {
		path,
		contentType: "application/json",
	});
});
