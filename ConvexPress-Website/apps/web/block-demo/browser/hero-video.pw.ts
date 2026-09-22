import { expect, test } from "@playwright/test";
import { selectPackReady } from "./pack-ready";

test("Video Hero loops only in view, honors pause and reduced motion, and keeps cover copy usable", async ({ page }, info) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/?block=core%2Fhero-video&example=1", { waitUntil: "networkidle" });
	const canvas = page.locator('[data-canonical-block="core/hero-video"]');
	const video = canvas.locator("video");
	for (const pack of ["core", "journal", "depot", "aster-house"]) {
		await selectPackReady(page, pack); await canvas.scrollIntoViewIfNeeded();
		await expect(canvas.getByRole("button", { name: "Play video", exact: true })).toBeVisible();
		expect(await video.evaluate((v: HTMLVideoElement) => ({ paused: v.paused, muted: v.muted, loop: v.loop, controls: v.controls }))).toEqual({ paused: true, muted: true, loop: true, controls: false });
		for (const width of [1200, 350]) {
			await canvas.evaluate((node, width) => { node.style.width = `${width}px`; node.style.maxWidth = "none"; node.querySelector('.cp-section[data-nested="false"] > .cp-container')?.setAttribute("data-width", "full"); }, width);
			expect(await canvas.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
			const media = await video.boundingBox(); const copy = await canvas.getByRole("heading", { level: 1 }).boundingBox();
			expect(copy!.y).toBeGreaterThan(media!.y); expect(copy!.y + copy!.height).toBeLessThan(media!.y + media!.height);
			await canvas.screenshot({ path: info.outputPath(`${pack}-${width}.png`) });
		}
	}
	await canvas.getByRole("button", { name: "Play video", exact: true }).click();
	await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
	await canvas.getByRole("button", { name: "Pause video", exact: true }).click();
	await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
	// A new cover starts automatically only with a normal motion preference.
	await page.emulateMedia({ reducedMotion: "no-preference" }); await page.reload({ waitUntil: "networkidle" }); await canvas.scrollIntoViewIfNeeded();
	await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
	await page.evaluate(() => window.scrollTo(0, 0));
	await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
	await canvas.scrollIntoViewIfNeeded(); await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
	await page.emulateMedia({ reducedMotion: "reduce" }); await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
	await canvas.getByRole("button", { name: "Play video", exact: true }).focus(); await page.keyboard.press("Enter");
	await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
	await canvas.getByRole("button", { name: "Pause video", exact: true }).click();
});

test("failed Video Hero keeps poster and copy and can retry", async ({ page }) => {
	let refuse = true;
	await page.route("**/media/workshop-fixture.webm", route => refuse ? route.abort() : route.continue());
	await page.goto("/?block=core%2Fhero-video&example=1", { waitUntil: "networkidle" });
	const canvas = page.locator('[data-canonical-block="core/hero-video"]'); await canvas.scrollIntoViewIfNeeded();
	await expect(canvas.getByText("Video unavailable", { exact: true })).toBeVisible();
	await expect(canvas.getByRole("heading", { name: "A moment from the workshop.", exact: true })).toBeVisible();
	await expect(canvas.locator(".cp-video-cover-poster")).toBeVisible();
	refuse = false; await canvas.getByRole("button", { name: "Retry video", exact: true }).click();
	await expect.poll(() => canvas.locator("video").evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
	await expect(canvas.getByText("Video unavailable", { exact: true })).toHaveCount(0);
});
