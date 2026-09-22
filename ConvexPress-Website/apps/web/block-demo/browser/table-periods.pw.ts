import { test, expect } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

for (const width of [1440, 390]) {
	test(`authored price periods keep prices with plans and support keyboard selection · ${width}`, async ({ page }, info) => {
		test.setTimeout(90_000);
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/?block=core%2Fpricing-table&example=0", { waitUntil: "networkidle" });
		await page.getByText("Try local field edits", { exact: true }).click();
		const study = page.getByRole("region", { name: "Local block authoring preview" });
		const form = study.getByRole("form", { name: "Pricing table content", exact: true });
		const canvas = study.locator('[data-authoring-preview="canvas"]');
		const errors: string[] = [];
		page.on("pageerror", e => errors.push(e.message));
		for (const pack of ["core", "aster-house", "journal", "depot"]) {
			await selectPackReady(page, pack);
			await study.getByRole("button", { name: "Reset local draft", exact: true }).click();
			await form.getByRole("textbox", { name: "Price Label", exact: true }).fill("$12 / month");
			await form.getByRole("textbox", { name: "Alternate price", exact: true }).fill("$120 / year");
			await form.getByRole("button", { name: "Add Plans", exact: true }).click();
			await form.getByLabel("Name value mode", { exact: true }).last().selectOption("value");
			await form.getByRole("textbox", { name: "Name", exact: true }).last().fill("Studio");
			await form.getByRole("textbox", { name: "Price Label", exact: true }).last().fill("$24 / month");
			const row = () => canvas.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /^(Monthly|Yearly) price$/ }) });
			await expect(canvas.getByRole("radio", { name: "Monthly", exact: true })).toBeChecked();
			const labelLines = await canvas.locator(".cp-library-price-periods span").evaluateAll(nodes => nodes.map(node => {
				const css = getComputedStyle(node);
				return (node.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)) / parseFloat(css.lineHeight);
			}));
			expect(labelLines.every(lines => lines < 1.1), `${pack}: short period names stay on one line`).toBe(true);
			await expect(row().getByRole("cell")).toHaveText(["$12 / month", "$24 / month"]);
			await canvas.getByRole("radio", { name: "Monthly", exact: true }).focus();
			await page.keyboard.press("ArrowRight");
			await expect(canvas.getByRole("radio", { name: "Yearly", exact: true })).toBeChecked();
			await expect(page.locator(".canonical-canvas").getByRole("radio", { name: "Monthly", exact: true })).toBeChecked();
			await expect(row().getByRole("cell")).toHaveText(["$120 / year", "Not specified"]);
			await form.getByLabel("Alternate price value mode", { exact: true }).last().selectOption("value");
			await form.getByRole("textbox", { name: "Alternate price", exact: true }).last().fill("$240 / year");
			await form.getByRole("button", { name: "Move Plans 2 up", exact: true }).click();
			await expect(canvas.getByRole("columnheader").nth(1)).toHaveText("Studio");
			await canvas.getByRole("radio", { name: "Yearly", exact: true }).check();
			await expect(row().getByRole("cell")).toHaveText(["$240 / year", "$120 / year"]);
			await canvas.getByRole("radio", { name: "Monthly", exact: true }).check();
			await expect(row().getByRole("cell")).toHaveText(["$24 / month", "$12 / month"]);
			await form.getByRole("textbox", { name: "Primary period", exact: true }).fill("W".repeat(80));
			await form.getByRole("textbox", { name: "Alternate period", exact: true }).fill("A".repeat(80));
			await expect(canvas.getByRole("radio", { name: "A".repeat(80), exact: true })).toHaveCount(1);
			expect(await canvas.evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
			await form.getByRole("textbox", { name: "Primary period", exact: true }).fill("Monthly");
			await form.getByRole("textbox", { name: "Alternate period", exact: true }).fill("Yearly");
			await canvas.getByRole("radio", { name: "Yearly", exact: true }).check();
			await canvas.screenshot({ path: info.outputPath(`${pack}-${width}-yearly.png`) });
			await form.getByLabel("Price periods value mode", { exact: true }).selectOption("unset");
			await expect(canvas.getByRole("radiogroup")).toHaveCount(0);
			await expect(canvas.getByRole("rowheader", { name: "Price", exact: true })).toBeVisible();
			await expect(canvas.getByRole("cell", { name: "$24 / month", exact: true })).toBeVisible();
		}
		expect(errors).toEqual([]);
	});
}

test("footnotes retain explicit numbering under the Website list reset", async ({ page }) => {
	await page.goto("/?block=core%2Ffootnotes&example=1", { waitUntil: "networkidle" });
	await page.addStyleTag({ content: "ol { list-style: none; }" });
	for (const pack of ["core", "aster-house", "journal", "depot"]) {
		await selectPackReady(page, pack);
		await expect(page.locator(".canonical-canvas .cp-library-footnotes")).toHaveCSS("list-style-type", "decimal");
	}
});

test("narrow comparisons allow the complete data columns to scroll into view", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/?block=core%2Fpricing-table&example=1", { waitUntil: "networkidle" });
	for (const pack of ["core", "aster-house", "journal", "depot"]) {
		await selectPackReady(page, pack);
		for (const name of ["core/pricing-table", "core/comparison-table"]) {
			await page.locator("#canonical-block").selectOption(name);
			const canvas = page.locator(".canonical-canvas");
			const scroll = canvas.getByRole("region");
			await expect.poll(() => scroll.evaluate(n => n.clientWidth)).toBeGreaterThan(200);
			await expect(scroll.locator("th").first()).toHaveCSS("position", "static");
			await scroll.focus();
			await page.keyboard.press("ArrowRight");
			await expect.poll(() => scroll.evaluate(n => n.scrollLeft)).toBeGreaterThan(0);
			await expect(scroll.locator("th").first()).toHaveAttribute("scope", "col");
			expect(await canvas.evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
		}
	}
});
