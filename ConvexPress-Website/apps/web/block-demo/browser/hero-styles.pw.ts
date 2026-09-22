import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("Hero editorial and poster styles preserve content and fit every template", async ({ page }, info) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1440, height: 1100 });
	await page.goto("/?block=core%2Fhero&example=2", { waitUntil: "networkidle" });
	const choice = page.getByRole("combobox", { name: "Block style", exact: true });
	const specimen = page.locator('[data-canonical-block="core/hero"]');
	const originalCopy = await specimen.innerText();
	for (const pack of ["core", "journal", "depot", "aster-house"]) {
		await selectPackReady(page, pack);
		for (const style of ["editorial", "poster"]) {
			await choice.selectOption(style);
			await expect(specimen.locator(`[data-hero-style="${style}"]`)).toBeVisible();
			expect(await specimen.innerText()).toBe(originalCopy);
			const first = specimen.getByRole("link", { name: "Explore the studies", exact: true });
			await first.focus(); await page.keyboard.press("Tab");
			await expect(specimen.getByRole("link", { name: "See the details", exact: true })).toBeFocused();
			for (const width of [1200, 350]) {
				await specimen.evaluate((node, width) => { node.style.width = `${width}px`; node.style.maxWidth = "none"; node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute("data-width", "full"); }, width);
				expect(await specimen.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
				expect(await specimen.locator("img").evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
				await specimen.screenshot({ path: info.outputPath(`${pack}-${style}-${width}.png`) });
			}
		}
	}
	await page.getByText("Try local field edits", { exact: true }).click();
	const form = page.getByRole("region", { name: "Local block authoring preview" });
	const canvas = form.locator('[data-authoring-preview="canvas"]');
	await form.getByRole("textbox", { name: "Title", exact: true }).fill("A".repeat(120));
	for (const style of ["editorial", "poster"]) {
		await choice.selectOption(style);
		// Style changes start a fresh local specimen, so apply the maximum title again.
		await form.getByRole("textbox", { name: "Title", exact: true }).fill("A".repeat(120));
		await canvas.evaluate(node => { node.style.width = "320px"; node.style.maxWidth = "none"; });
		expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
		await form.getByRole("button", { name: "Reset Media Id", exact: true }).click();
		await expect(canvas.locator("img")).toHaveCount(0);
		await expect(canvas.getByRole("heading", { level: 1 })).toHaveText("A".repeat(120));
	}
	await page.getByRole("combobox", { name: "Example", exact: true }).selectOption("0");
	await expect(specimen.locator("img,h1,a")).toHaveCount(0);
});
