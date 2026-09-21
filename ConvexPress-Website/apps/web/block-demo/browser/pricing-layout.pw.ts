import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [1440, 900, 390]) {
	test(`pricing plans use the available row width as content is added and removed · ${width}`, async ({
		page,
	}, info) => {
		test.setTimeout(90_000);
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/?block=core%2Fpricing-cards&example=1", {
			waitUntil: "networkidle",
		});
		await page.getByText("Try local field edits", { exact: true }).click();
		const study = page.getByRole("region", {
			name: "Local block authoring preview",
		});
		const form = study.getByRole("form", { name: "Pricing Cards content" });
		const canvas = study.locator('[data-authoring-preview="canvas"]');
		const grid = canvas.locator(".cp-grid").first();
		for (const pack of ["core", "aster-house", "journal", "depot"]) {
			await selectPackReady(page, pack);
			await study
				.getByRole("button", { name: "Reset local draft", exact: true })
				.click();
			const check = async (count: number) => {
				await expect(grid.locator(":scope > *")).toHaveCount(count);
				const columns =
					width < 768
						? 1
						: width < 1152
							? Math.min(count, 2)
							: count === 4
								? 2
								: Math.min(count, 3);
				const shape = await grid.evaluate((node, firstRowCount) => {
					const bounds = node.getBoundingClientRect();
					const children = Array.from(node.children).map((child) =>
						child.getBoundingClientRect(),
					);
					return {
						width: bounds.width,
						filled: children[firstRowCount - 1].right - children[0].left,
						firstWidth: children[0].width,
						gap: parseFloat(getComputedStyle(node).columnGap),
					};
				}, columns);
				expect(
					Math.abs(shape.width - shape.filled),
					`${pack}: ${count} plans must not reserve empty columns`,
				).toBeLessThanOrEqual(1);
				expect(
					Math.abs(
						shape.firstWidth * columns +
							shape.gap * (columns - 1) -
							shape.width,
					),
				).toBeLessThanOrEqual(1);
				expect(
					await canvas.evaluate(
						(node) => node.scrollWidth <= node.clientWidth + 1,
					),
				).toBe(true);
				await expect(
					canvas.getByRole("heading", { name: "Starter", exact: true }),
				).toBeVisible();
				await expect(
					canvas.getByRole("link", { name: "Start", exact: true }),
				).toHaveAttribute("href", "/signup");
				if ([1, 2, 4].includes(count))
					await canvas.screenshot({
						path: info.outputPath(`${pack}-${count}-plans-${width}.png`),
						animations: "disabled",
					});
			};
			await check(2);
			if (width >= 768) {
				const actions = await canvas
					.getByRole("link")
					.evaluateAll((links) =>
						links.map((link) => link.getBoundingClientRect().bottom),
					);
				expect(
					Math.abs(actions[0] - actions[1]),
					`${pack}: plan actions align despite different feature counts`,
				).toBeLessThanOrEqual(1);
			}
			await form
				.getByRole("button", { name: "Remove Plans 2", exact: true })
				.click();
			await check(1);
			await form
				.getByRole("button", { name: "Remove Plans 1", exact: true })
				.click();
			await expect(grid.locator(":scope > *")).toHaveCount(0);
			await study
				.getByRole("button", { name: "Reset local draft", exact: true })
				.click();
			for (let count = 3; count <= 6; count++) {
				await form
					.getByRole("button", { name: "Add Plans", exact: true })
					.click();
				await form
					.getByRole("textbox", { name: "Name", exact: true })
					.last()
					.fill(`Plan ${count}`);
				await check(count);
			}
			await expect(
				form.getByRole("button", { name: "Add Plans", exact: true }),
			).toBeDisabled();
			// Valid maximum-length copy must wrap inside the plan, including its action.
			await form.getByRole("textbox", { name: "Name", exact: true }).last().fill("W".repeat(40));
			await form.getByRole("textbox", { name: "Price", exact: true }).last().fill("9".repeat(40));
			await form.getByRole("textbox", { name: "Description", exact: true }).last().fill("A".repeat(200));
			await form.getByRole("textbox", { name: "Cta Label", exact: true }).last().fill("W".repeat(40));
			await form.getByRole("textbox", { name: "Cta Url", exact: true }).last().fill("/plans/long-copy");
			await expect(canvas.getByRole("link", { name: "W".repeat(40), exact: true })).toHaveAttribute("href", "/plans/long-copy");
			await check(6);
			const lastCard = grid.locator(":scope > *").last();
			expect(await lastCard.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
			await lastCard.screenshot({ path: info.outputPath(`${pack}-long-copy-${width}.png`), animations: "disabled" });
			await expect(
				canvas.getByRole("link", { name: "Choose Pro", exact: true }),
			).toHaveAttribute("href", "/signup?plan=pro");
		}
		expect(errors).toEqual([]);
	});
}
