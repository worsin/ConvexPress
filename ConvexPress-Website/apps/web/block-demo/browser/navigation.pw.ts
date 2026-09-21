import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
for (const width of [1440, 390])
	test(`navigation links, current state and filtered site identity at ${width}px`, async ({
		page,
	}, testInfo) => {
		test.setTimeout(120000);
		await page.setViewportSize({ width, height: 1000 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		const evidence = [];
		for (const pack of ["core", "journal", "depot", "aster-house"]) {
			await page.locator("#pack").selectOption(pack);
			for (const name of [
				"core/breadcrumbs",
				"core/anchor-nav",
				"core/table-of-contents",
				"core/site-info",
				"core/child-pages",
                    "core/menu",
			]) {
				await page.locator("#canonical-block").selectOption(name);
				const count = await page.locator("#canonical-example option").count();
				await page
					.locator("#canonical-example")
					.selectOption(String(count - 1));
				const canvas = page.locator(".canonical-canvas");
				await canvas.scrollIntoViewIfNeeded();
				await expect(canvas.locator('[data-demo-ready="true"]')).toHaveCount(1);
				await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
				const bounds = await canvas.evaluate((node) => ({
					canvasWidth: node.getBoundingClientRect().width,
					overflow: document.documentElement.scrollWidth > innerWidth,
				}));
				expect(bounds.canvasWidth).toBeGreaterThan(0);
				expect(bounds.overflow).toBe(false);
				if (name === "core/anchor-nav" || name === "core/table-of-contents") {
					const links = canvas.locator("nav a");
					await expect(links).toHaveCount(3);
					for (const link of await links.all()) {
						const href = await link.getAttribute("href");
						expect(href).toMatch(/^#[A-Za-z][\w-]*$/);
						await expect(
							canvas.locator(`[id="${href!.slice(1)}"]`),
						).toHaveCount(1);
					}
					const target = (await links.nth(1).getAttribute("href"))!.slice(1);
					await links.nth(1).focus();
					await page.keyboard.press("Enter");
					await expect(canvas.locator(`[id="${target}"]`)).toBeFocused();
					await expect(links.nth(1)).toHaveAttribute(
						"aria-current",
						"location",
					);
					const position = await canvas
						.locator(`[id="${target}"]`)
						.evaluate((node) => node.getBoundingClientRect().top);
					expect(position).toBeGreaterThanOrEqual(-1);
                } else if (name === "core/child-pages") {
                    const links = canvas.locator("nav a");
                    await expect(links).toHaveCount(4);
                    await expect(canvas.locator("nav > ul > li")).toHaveCount(3);
                    await expect(canvas.locator("nav li ul a")).toHaveText("Living with ceramics");
                    await links.first().focus();
                    await page.keyboard.press("Tab");
                    await expect(links.nth(1)).toBeFocused();
                    expect(await links.nth(1).getAttribute("href")).toBe("/page/journal/materials/ceramics");
				} else if (name === "core/menu") {
          const nav=canvas.getByRole('navigation',{name:'Explore Aster House'});
          const links=nav.locator('a');
          await expect(links).toHaveCount(4);
          await expect(nav.locator('li ul a')).toHaveCount(2);
          await links.first().focus();await page.keyboard.press('Tab');await expect(links.nth(1)).toBeFocused();
          await expect(links.last()).toHaveAttribute('rel','noopener noreferrer');
          await expect(links.last()).toContainText('opens in a new tab');
        } else if (name === "core/breadcrumbs") {
					await expect(canvas.locator('[aria-current="page"]')).toHaveText(
						"Studio field notes",
					);
				} else {
					await expect(canvas.locator("h2")).toHaveText("Aster House");
					await expect(canvas.locator("img")).toHaveCount(0);
					await expect(canvas).toContainText("fictional mountain retreat");
				}
				await canvas.screenshot({
					path: testInfo.outputPath(
						`navigation-${width}-${pack}-${name.replace("/", "-")}.png`,
					),
					animations: "disabled",
				});
				evidence.push({ width, pack, name, ...bounds });
			}
		}
		expect(errors).toEqual([]);
		const path = testInfo.outputPath("navigation-geometry.json");
		await writeFile(path, JSON.stringify(evidence, null, 2));
		await testInfo.attach("navigation geometry", {
			path,
			contentType: "application/json",
		});
	});
