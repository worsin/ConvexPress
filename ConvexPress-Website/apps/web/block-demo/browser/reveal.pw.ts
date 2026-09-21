import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("section reveal waits for viewport, finishes once, and honors reduced motion and focus", async ({
	page,
}, testInfo) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.goto("/", { waitUntil: "networkidle" });
	const section = page.getByRole("region", {
		name: "Interactive specimens",
		exact: true,
	});
	await expect(section).toHaveAttribute("data-reveal", "pending");
	expect(
		await section.evaluate((node) => ({
			animations: node.getAnimations().length,
			opacity: getComputedStyle(node).opacity,
		})),
	).toEqual({ animations: 0, opacity: "1" });
	await section.evaluate((node) =>
		node.scrollIntoView({ block: "start", behavior: "instant" }),
	);
	await expect(section).toHaveAttribute("data-reveal", "entered");
	const animation = await section.evaluate(async (node) => {
		const active = node
			.getAnimations()
			.find((item) => (item as CSSAnimation).animationName === "cp-reveal");
		if (!active || !(active.effect instanceof KeyframeEffect))
			throw new Error("Expected a real active reveal animation");
		const keyframes = active.effect.getKeyframes();
		const firstBox = node.getBoundingClientRect();
		await active.finished;
		const finalBox = node.getBoundingClientRect();
		return {
			keyframes,
			duration: active.effect.getTiming().duration,
			widthDelta: finalBox.width - firstBox.width,
			heightDelta: finalBox.height - firstBox.height,
			finalTransform: getComputedStyle(node).transform,
			finalOpacity: getComputedStyle(node).opacity,
		};
	});
	expect(animation.duration).toBe(500);
	expect(animation.widthDelta).toBe(0);
	expect(animation.heightDelta).toBe(0);
	expect(animation.finalTransform).toBe("none");
	expect(animation.finalOpacity).toBe("1");
	for (const frame of animation.keyframes)
		expect(
			Object.keys(frame).filter(
				(key) =>
					![
						"offset",
						"computedOffset",
						"easing",
						"composite",
						"opacity",
						"transform",
					].includes(key),
			),
		).toEqual([]);
	await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
	await section.evaluate((node) =>
		node.scrollIntoView({ block: "start", behavior: "instant" }),
	);
	expect(await section.evaluate((node) => node.getAnimations().length)).toBe(0);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await expect(section).toHaveAttribute("data-reveal", "settled");
	expect(
		await section.evaluate((node) => ({
			animation: getComputedStyle(node).animationName,
			opacity: getComputedStyle(node).opacity,
		})),
	).toEqual({ animation: "none", opacity: "1" });
	await page.reload({ waitUntil: "networkidle" });
	await expect(section).toHaveAttribute("data-reveal", "settled");
	expect(await section.evaluate((node) => node.getAnimations().length)).toBe(0);
	await page.emulateMedia({ reducedMotion: "no-preference" });
	expect(await section.evaluate((node) => node.getAnimations().length)).toBe(0);
	await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
	await page.reload({ waitUntil: "networkidle" });
	await expect(section).toHaveAttribute("data-reveal", "pending");
	await section.getByRole("tab", { name: "Clay", exact: true }).focus();
	await expect(section).toHaveAttribute("data-reveal", "settled");
	expect(await section.evaluate((node) => node.getAnimations().length)).toBe(0);
	expect(errors).toEqual([]);
	await writeFile(
		testInfo.outputPath("section-reveal-acceptance.json"),
		JSON.stringify(
			{
				animation,
				waitedForViewport: true,
				noReplay: true,
				reducedMotion: true,
				keyboardFocusCancels: true,
				pageErrors: errors,
				scope:
					"Real browser behavior and animation properties; not a compositor trace or universal frame-time certification",
			},
			null,
			2,
		),
	);
});
