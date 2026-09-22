import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import {
	discoverSourceInventory,
	compareRendererInventory,
} from "./inventory.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { primitiveNames } from "../../src/templates/sdk/primitives/contracts";

for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
]) {
	test(`discovered packs and keyboard at ${viewport.width}px`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize(viewport);
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("console", (message) => {
			if (message.type() === "error") errors.push(message.text());
		});
		await page.goto("/", { waitUntil: "networkidle" });
		const packs = await page
			.locator("#pack option")
			.evaluateAll((options) =>
				options.map((option) => (option as HTMLOptionElement).value),
			);
		expect(packs.length).toBeGreaterThan(0);
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			await page.evaluate(() => document.fonts.ready);
			await expect(page.locator(".specimen-canvas")).toHaveAttribute(
				"data-pack",
				pack,
			);
			for (const name of primitiveNames)
				await expect(page.locator(".specimen-canvas").locator(`[data-primitive="${name}"]`)).toHaveCount(1);
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true);
			await page.screenshot({
				path: testInfo.outputPath(`${pack}-${viewport.width}.png`),
				fullPage: true,
				animations: "disabled",
			});
			const presets = await page
				.locator("#preset option")
				.evaluateAll((options) =>
					options.map((option) => (option as HTMLOptionElement).value),
				);
			for (const preset of presets) {
				await page.locator("#preset").selectOption(preset);
				await expect(page.locator(".theme-status")).not.toBeEmpty();
			}
			await page.locator("#preset").selectOption("default");
		}
		await page.getByRole("tab", { name: "Clay", exact: true }).focus();
		await page.keyboard.press("ArrowRight");
		await expect(
			page.getByRole("tab", { name: "Glaze", exact: true }),
		).toBeFocused();
		await expect(
			page.getByRole("tab", { name: "Glaze", exact: true }),
		).toHaveAttribute("aria-selected", "true");
		await expect(page.getByRole("tabpanel")).toHaveCount(1);
		expect(errors).toEqual([]);
	});
}

test("marquee motion, pause, reduced motion and frame timing report", async ({
	page,
}, testInfo) => {
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.goto("/", { waitUntil: "networkidle" });
	const track = page.locator(".cp-marquee-track");
	await expect
		.poll(() =>
			track.evaluate((node) => getComputedStyle(node).animationPlayState),
		)
		.toBe("paused");
	const play = page.getByRole("button", { name: "Play motion" });
	await play.scrollIntoViewIfNeeded();
	await play.focus();
	const control = await play.evaluate((node) => {
		const style = getComputedStyle(node);
		return {
			width: node.getBoundingClientRect().width,
			height: node.getBoundingClientRect().height,
			appearance: style.appearance,
			outlineStyle: style.outlineStyle,
		};
	});
	expect(control.width).toBeGreaterThanOrEqual(44);
	expect(control.height).toBeGreaterThanOrEqual(44);
	expect(control.appearance).toBe("none");
	expect(control.outlineStyle).toBe("solid");
	await play.click();
	await page.mouse.move(0, 0);
	await expect
		.poll(() =>
			track.evaluate((node) => getComputedStyle(node).animationPlayState),
		)
		.toBe("running");
	const metrics = await page.evaluate(async () => {
		const longTasks: number[] = [];
		const observer = new PerformanceObserver((list) =>
			longTasks.push(...list.getEntries().map((entry) => entry.duration)),
		);
		observer.observe({ type: "longtask", buffered: false });
		const frames: number[] = [];
		await new Promise<void>((resolve) => {
			let previous = 0;
			const frame = (now: number) => {
				if (previous) frames.push(now - previous);
				previous = now;
				if (frames.length < 120) requestAnimationFrame(frame);
				else resolve();
			};
			requestAnimationFrame(frame);
		});
		observer.disconnect();
		const sorted = [...frames].sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)];
		return {
			frames: frames.length,
			medianMs: median,
			p95Ms: sorted[Math.floor(sorted.length * 0.95)],
			maxMs: sorted.at(-1),
			framesOverTwiceMedian: frames.filter((value) => value > median * 2)
				.length,
			longTasks,
			devicePixelRatio,
			evidence:
				"Local RAF sampling; not a GPU trace or complete performance certification",
		};
	});
	const metricsPath = testInfo.outputPath("motion-frame-timing.json");
	await writeFile(metricsPath, JSON.stringify(metrics, null, 2));
	await testInfo.attach("motion-frame-timing.json", {
		path: metricsPath,
		contentType: "application/json",
	});
	await page.getByRole("button", { name: "Pause motion" }).click();
	await expect
		.poll(() =>
			track.evaluate((node) => getComputedStyle(node).animationPlayState),
		)
		.toBe("paused");
	await page.emulateMedia({ reducedMotion: "reduce" });
	await expect
		.poll(() => track.evaluate((node) => getComputedStyle(node).animationName))
		.toBe("none");
	await expect
		.poll(() => track.evaluate((node) => getComputedStyle(node).transform))
		.toBe("none");
});

test("canonical static block matrix under every discovered pack", async ({
	page,
}, testInfo) => {
	test.setTimeout(480000);
	const viewports = [
		{ width: 1440, height: 1000 },
		{ width: 390, height: 844 },
	];
	await page.setViewportSize(viewports[0]);
	await page.emulateMedia({ reducedMotion: "reduce" });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto("/", { waitUntil: "networkidle" });
	const packs = await page
		.locator("#pack option")
		.evaluateAll((options) =>
			options.map((option) => (option as HTMLOptionElement).value),
		);
	const sourceInventory = await discoverSourceInventory(
		fileURLToPath(new URL("../../../../../blocks/", import.meta.url)),
	);
	const advertisedBlocks = await page
		.locator("#canonical-block option")
		.evaluateAll((options) =>
			options
				.filter((option) => option.textContent?.startsWith("●"))
				.map((option) => (option as HTMLOptionElement).value),
		);
	const canonicalSpecCount = await page
		.locator("#canonical-block option")
		.count();
	const inventoryComparison = compareRendererInventory(
		sourceInventory.renderers,
		advertisedBlocks,
	);
	const inventoryPath = testInfo.outputPath("canonical-source-inventory.json");
	await writeFile(
		inventoryPath,
		JSON.stringify(
			{
				sourceInventory,
				advertisedBlocks,
				inventoryComparison,
				advertisedSpecCount: canonicalSpecCount,
			},
			null,
			2,
		),
	);
	await testInfo.attach("canonical-source-inventory.json", {
		path: inventoryPath,
		contentType: "application/json",
	});
	expect(
		inventoryComparison,
		"Runtime discovery must exactly match independent canonical render.tsx inventory",
	).toEqual({ missing: [], unexpected: [], duplicates: [] });
	expect(canonicalSpecCount).toBe(sourceInventory.specs.length);
	const blocks = sourceInventory.renderers.map((entry) => entry.name);
	const absentMediaCopy: Record<string, string[]> = {
		"core/author-bio": ["Rowan Vale", "Fictional field journal editor"],
		"core/hero-split": ["Two-column hero", "Copy + product shot."],
		"core/image": ["Figure 1 — system overview"],
		"core/logo-cloud": ["Trusted by teams at", "Acme"],
		"core/media-text": ["Prompt, polish, publish", "See a demo"],
		"core/team-grid": ["Rowan Vale", "Morgan Reed", "no portraits"],
	};
	const absentMediaExamples = new Map<string, number>();
	for (const [name, copy] of Object.entries(absentMediaCopy)) {
		const spec = JSON.parse(await readFile(new URL(`../../../../../blocks/${name}/block.json`, import.meta.url), "utf8")) as { examples: unknown[] };
		const index = spec.examples.findIndex(example => copy.every(text => JSON.stringify(example).includes(text)));
		expect(index, `Missing explicit no-media specimen for ${name}`).toBeGreaterThanOrEqual(0);
		absentMediaExamples.set(name, index);
	}
	const expectedScreenshots = blocks.length * packs.length * viewports.length;
	const evidence: {
		viewport: { width: number; height: number };
		pack: string;
		name: string;
		version: string | null;
		path: string;
	}[] = [];
	for (const viewport of viewports) {
		await page.setViewportSize(viewport);
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			await page.evaluate(() => document.fonts.ready);
			for (const { name, version } of sourceInventory.renderers) {
				await page.locator("#canonical-block").selectOption(name);
				const options = await page.locator("#canonical-example option").count();
				await page
					.locator("#canonical-example")
					.selectOption(String(absentMediaExamples.get(name) ?? options - 1));
				await expect(page.locator(".canonical-canvas")).toHaveAttribute(
					"data-canonical-block",
					name,
				);
				await expect(page.locator(".canonical-canvas")).toHaveAttribute(
					"data-canonical-version",
					String(version),
				);
				await expect(
					page.locator(".canonical-canvas .block-not-ready"),
				).toHaveCount(0);
				if (name === "core/featured-page")
					await expect(
						page.locator(".canonical-canvas .featured-data-demo"),
					).toHaveAttribute("data-demo-ready", "true");
				if (
					[
						"core/breadcrumbs",
						"core/anchor-nav",
						"core/table-of-contents",
						"core/site-info",
						"core/child-pages",
                    "core/menu",
					].includes(name)
				)
					await expect(
						page.locator(".canonical-canvas .navigation-demo"),
					).toHaveAttribute("data-demo-ready", "true");
				if (Object.hasOwn(absentMediaCopy, name)) {
					const canvas = page.locator(".canonical-canvas");
					await expect(canvas.locator("img")).toHaveCount(0);
					for (const text of absentMediaCopy[name])
						await expect(canvas).toContainText(text);
					if (["core/hero-split", "core/media-text"].includes(name))
						await expect(canvas.locator(".cp-split")).toHaveCount(0);
				}
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth,
					),
				).toBe(true);
				const path = testInfo.outputPath(
					`canonical-${viewport.width}-${pack}-${name.replaceAll("/", "-")}.png`,
				);
				await page
					.locator(".canonical-gallery")
					.screenshot({ path, animations: "disabled" });
				evidence.push({
					viewport,
					pack,
					name,
					version: await page
						.locator(".canonical-canvas")
						.getAttribute("data-canonical-version"),
					path,
				});
			}
		}
	}
	expect(evidence).toHaveLength(expectedScreenshots);
	const path = testInfo.outputPath("canonical-matrix.json");
	await writeFile(
		path,
		JSON.stringify(
			{
				scope:
					"Selected canonical examples through synthetic adapters; not all-example, live-provider, native-editor, visual or motion acceptance",
				viewports,
				sourceInventory,
				renderedBlockCount: blocks.length,
				canonicalSpecCount,
				expectedScreenshots,
				capturedScreenshots: evidence.length,
				packs,
				blocks,
				evidence,
			},
			null,
			2,
		),
	);
	await testInfo.attach("canonical-matrix.json", {
		path,
		contentType: "application/json",
	});
	expect(errors).toEqual([]);
});

for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
]) {
	test(`structural block interactions at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		const canvas = page.locator(".canonical-canvas");
		const select = async (name: string) => {
			await page.locator("#canonical-block").selectOption(name);
			const count = await page.locator("#canonical-example option").count();
			await page.locator("#canonical-example").selectOption(String(count - 1));
			await expect(canvas).toHaveAttribute("data-canonical-block", name);
			await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
		};
		await select("core/accordion");
		const details = canvas.locator("details").first();
		const marker = await details.locator("summary").evaluate((node) => ({
			listStyle: getComputedStyle(node).listStyleType,
			display: getComputedStyle(node).display,
			markerContent: getComputedStyle(node, "::marker").content,
		}));
		expect(marker.listStyle).toBe("none");
		expect(marker.display).toBe("block");
		expect(marker.markerContent).toBe('""');
		await expect(details.locator("summary svg")).toHaveCount(1);
		await expect(details).toHaveAttribute("open", "");
		await details.locator("summary").focus();
		await page.keyboard.press("Enter");
		await expect(details).not.toHaveAttribute("open");
		await expect(details.locator(":scope > div")).not.toBeVisible();
		await page.keyboard.press("Enter");
		await expect(details.locator(":scope > div")).toBeVisible();
		await select("core/tabs");
		const tabs = canvas.getByRole("tab");
		await tabs.first().focus();
		await page.keyboard.press("End");
		await expect(tabs.last()).toBeFocused();
		await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
		await expect(canvas.getByRole("tabpanel")).toHaveCount(1);
		await page.keyboard.press("Home");
		await expect(tabs.first()).toBeFocused();
		await page.keyboard.press("ArrowRight");
		await expect(tabs.nth(1)).toBeFocused();
		await select("core/table");
		await expect(canvas.locator("table caption")).not.toBeEmpty();
		const headers = canvas.locator("thead th");
		expect(await headers.count()).toBeGreaterThan(0);
		for (const header of await headers.all())
			await expect(header).toHaveAttribute("scope", "col");
		const scrollRegion = canvas.getByRole("region");
		await scrollRegion.focus();
		await expect(scrollRegion).toBeFocused();
		expect(
			await scrollRegion.evaluate((node) => getComputedStyle(node).overflowX),
		).toBe("auto");
		await select("core/sticky-aside");
		const aside = canvas.getByRole("complementary", {
			name: "Additional content",
		});
		await expect(canvas.locator(".cp-sticky-main")).toContainText(
			"Composition study 1",
		);
		await expect(aside).toContainText("Composition study 2");
		await aside.focus();
		await expect(aside).toBeFocused();
		expect(
			await aside.evaluate((node) => getComputedStyle(node).position),
		).toBe(viewport.width >= 1024 ? "sticky" : "static");
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		expect(errors).toEqual([]);
	});
}

for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
]) {
	test(`canonical media controls and modal keyboard at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		const canvas = page.locator(".canonical-canvas");
		const select = async (name: string) => {
			await page.locator("#canonical-block").selectOption(name);
			const count = await page.locator("#canonical-example option").count();
			await page.locator("#canonical-example").selectOption(String(count - 1));
			await expect(canvas).toHaveAttribute("data-canonical-block", name);
			await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
		};
		await select("core/video");
		const video = canvas.locator("video");
		await expect(video).toHaveAttribute("controls", "");
		expect(await video.getAttribute("autoplay")).toBeNull();
		expect(
			await video.evaluate(
				(node) => node instanceof HTMLMediaElement && node.paused,
			),
		).toBe(true);
		await expect(video.locator('track[kind="captions"]')).toHaveAttribute(
			"src",
			"/media/workshop-fixture.vtt",
		);
		const transcript = canvas.getByRole("link", {
			name: "Read the sample transcript",
		});
		const transcriptHref = await transcript.getAttribute("href");
		expect(transcriptHref).toBeTruthy();
		if (!transcriptHref) throw new Error("Missing transcript destination");
		const response = await page.request.get(transcriptHref);
		expect(response.ok()).toBe(true);
		expect(await response.text()).toContain("Synthetic silent video fixture");
		await select("core/audio");
		const audio = canvas.locator("audio");
		await expect(audio).toHaveAttribute("controls", "");
		await expect(audio).toHaveAttribute("preload", "none");
		expect(await audio.getAttribute("autoplay")).toBeNull();
		expect(
			await audio.evaluate(
				(node) => node instanceof HTMLMediaElement && node.paused,
			),
		).toBe(true);
		await select("core/file-download");
		const file = canvas.locator("a[download]");
		const downloaded = page.waitForEvent("download");
		await file.click();
		expect((await downloaded).suggestedFilename()).toBe("sample-notebook.txt");
		await select("core/before-after");
		const slider = canvas.getByRole("slider");
		await slider.focus();
		await page.keyboard.press("Home");
		await expect(slider).toHaveAttribute("aria-valuetext", /^0% /);
		await page.keyboard.press("End");
		await expect(slider).toHaveAttribute("aria-valuetext", /^100% /);
		await page.keyboard.press("ArrowLeft");
		await expect(slider).toHaveAttribute("aria-valuetext", /^99% /);
		await select("core/gallery");
		const dialog = canvas.getByRole("dialog");
		await expect(dialog).toHaveCount(0);
		const trigger = canvas.getByRole("button", { name: /^View / }).first();
		await trigger.click();
		await expect(dialog).toBeVisible();
		await dialog.getByRole("button", { name: /^Close preview/ }).focus();
		await page.keyboard.press("Shift+Tab");
		await expect(
			dialog.getByRole("button", { name: "Next image" }),
		).toBeFocused();
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press("Tab");
			expect(
				await dialog.evaluate((node) => node.contains(document.activeElement)),
			).toBe(true);
		}
		await dialog.getByRole("button", { name: "Next image" }).click();
		await expect(dialog.locator('[aria-live="polite"]')).toContainText("2 /");
		await page.keyboard.press("Escape");
		await expect(dialog).toHaveCount(0);
		await expect(trigger).toBeFocused();
		await select("core/code");
		const region = canvas.getByRole("region", { name: "Code: hello.ts" });
		await region.focus();
		await expect(region).toBeFocused();
		expect(
			await region.evaluate((node) => getComputedStyle(node).overflowX),
		).toBe("auto");
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		expect(errors).toEqual([]);
	});
}

for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
]) {
	test(`canonical content tables and footnote targets under every pack at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await page.emulateMedia({ reducedMotion: "reduce" });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto("/", { waitUntil: "networkidle" });
		const packs = await page
			.locator("#pack option")
			.evaluateAll((options) =>
				options.map((option) => (option as HTMLOptionElement).value),
			);
		const canvas = page.locator(".canonical-canvas");
		const select = async (name: string) => {
			await page.locator("#canonical-block").selectOption(name);
			const count = await page.locator("#canonical-example option").count();
			await page.locator("#canonical-example").selectOption(String(count - 1));
			await expect(canvas).toHaveAttribute("data-canonical-block", name);
			await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
		};
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			await select("core/pricing-table");
			const pricing = canvas.getByRole("region", {
				name: "Plan comparison",
				exact: true,
			});
			await pricing.focus();
			await expect(pricing).toBeFocused();
			await expect(pricing.getByRole("columnheader")).toHaveCount(3);
			const promptRow = pricing.getByRole("row").filter({
				has: page.getByRole("rowheader", {
					name: "Observation prompts",
					exact: true,
				}),
			});
			expect(await promptRow.getByRole("cell").allTextContents()).toEqual([
				"One",
				"Three",
			]);
			await expect(
				pricing.getByRole("link", { name: "See the study", exact: true }),
			).toHaveAttribute("href", "#studies");
			await expect(pricing.locator("input,select,button")).toHaveCount(0);
			await select("core/comparison-table");
			const comparison = canvas.getByRole("region", {
				name: "Two ways to keep a field note",
				exact: true,
			});
			await comparison.focus();
			await expect(comparison).toBeFocused();
			expect(
				await comparison.getByRole("columnheader").allTextContents(),
			).toEqual(["Detail", "Digital notebook", "Paper notebook"]);
			const bringRow = comparison.getByRole("row").filter({
				has: page.getByRole("rowheader", {
					name: "What to bring",
					exact: true,
				}),
			});
			expect(await bringRow.getByRole("cell").allTextContents()).toEqual([
				"A charged device",
				"A notebook and pencil",
			]);
			expect(
				await comparison.evaluate((node) => getComputedStyle(node).overflowX),
			).toBe("auto");
			if (viewport.width === 390) {
				expect(
					await comparison.evaluate(
						(node) => node.scrollWidth > node.clientWidth,
					),
				).toBe(true);
				await comparison.evaluate((node) => {
					node.scrollLeft = 0;
				});
				await page.keyboard.press("ArrowRight");
				await expect
					.poll(() => comparison.evaluate((node) => node.scrollLeft))
					.toBeGreaterThan(0);
			}
			await select("core/footnotes");
			await canvas
				.getByRole("link", { name: "Link to note 2", exact: true })
				.click();
			await expect(page).toHaveURL(/#demo-note-place$/);
			const target = canvas.locator("#demo-note-place");
			await expect(target).toHaveCount(1);
			expect(await target.evaluate((node) => node.matches(":target"))).toBe(
				true,
			);
			await expect(target).toContainText("A place can change between visits");
			expect(
				await target.evaluate((node) =>
					parseFloat(getComputedStyle(node).scrollMarginBlockStart),
				),
			).toBeGreaterThanOrEqual(24);
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true);
		}
		expect(errors).toEqual([]);
	});
}

test("card typography and bento rhythm follow the container", async ({
	page,
}, testInfo) => {
	test.setTimeout(120000);
	const evidence: unknown[] = [];
	const evidencePath = testInfo.outputPath("card-typography-evidence.json");
	async function recordEvidence(entry: unknown) {
		evidence.push(entry);
		await writeFile(
			evidencePath,
			JSON.stringify(
				{ scope: "50-renderer card polish only", evidence },
				null,
				2,
			),
		);
	}
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
			.evaluateAll((options) =>
				options.map((option) => (option as HTMLOptionElement).value),
			);
		for (const pack of packs) {
			await page.locator("#pack").selectOption(pack);
			for (const name of [
				"core/bento-grid",
				"core/team-grid",
				"core/feature-list-alternating",
				"core/feature-grid",
			]) {
				await page.locator("#canonical-block").selectOption(name);
				const count = await page.locator("#canonical-example option").count();
				await page
					.locator("#canonical-example")
					.selectOption(String(count - 1));
				await page.evaluate(() => document.fonts.ready);
				const canvas = page.locator(".canonical-canvas");
				await expect(canvas).toHaveAttribute("data-canonical-block", name);
				await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
				// Locator screenshots scroll automatically; direct DOM geometry reads do not.
				// Measure the actual displayed specimen, never an offscreen/hidden copy.
				await canvas.scrollIntoViewIfNeeded();
				await expect(canvas).toBeVisible();
				const canvasGeometry = await canvas.evaluate((node) => {
					const box = node.getBoundingClientRect();
					const ancestors = [];
					for (
						let element: Element | null = node;
						element;
						element = element.parentElement
					) {
						const style = getComputedStyle(element);
						ancestors.push({
							tag: element.tagName,
							className: element.className,
							display: style.display,
							visibility: style.visibility,
							contentVisibility: style.contentVisibility,
						});
					}
					return { width: box.width, height: box.height, ancestors };
				});
				await recordEvidence({
					viewport,
					pack,
					name,
					phase: "canvas",
					canvasGeometry,
				});
				expect(canvasGeometry.width).toBeGreaterThan(0);
				expect(canvasGeometry.height).toBeGreaterThan(0);
				const headingNodes = canvas.locator(
					".cp-library-card-copy .cp-heading",
				);
				for (const heading of await headingNodes.all())
					await expect(heading).toBeVisible();
				const headings = await canvas
					.locator(".cp-library-card-copy .cp-heading")
					.evaluateAll((nodes) =>
						nodes.map((heading) => {
							const brokenWords: { word: string; lines: number }[] = [];
							const walker = document.createTreeWalker(
								heading,
								NodeFilter.SHOW_TEXT,
							);
							for (
								let node = walker.nextNode();
								node !== null;
								node = walker.nextNode()
							) {
								for (const match of (node.textContent || "").matchAll(
									/[\p{L}\p{N}]+/gu,
								)) {
									const range = document.createRange();
									range.setStart(node, match.index);
									range.setEnd(node, match.index + match[0].length);
									const lines = new Set(
										[...range.getClientRects()]
											.filter((rect) => rect.width > 0.1)
											.map((rect) => Math.round(rect.top)),
									);
									if (lines.size > 1)
										brokenWords.push({ word: match[0], lines: lines.size });
								}
							}
							const style = getComputedStyle(heading);
							return {
								text: heading.textContent,
								fontSize: parseFloat(style.fontSize),
								width: heading.clientWidth,
								scrollWidth: heading.scrollWidth,
								overflowWrap: style.overflowWrap,
								textTransform: style.textTransform,
								fontStyle: style.fontStyle,
								brokenWords,
							};
						}),
					);
				await recordEvidence({
					viewport,
					pack,
					name,
					phase: "headings",
					headings,
				});
				expect(headings.length).toBeGreaterThan(0);
				for (const heading of headings) {
					expect(
						heading.width,
						`${pack}/${name}: heading has rendered geometry`,
					).toBeGreaterThan(0);
					expect(
						heading.brokenWords,
						`${pack}/${name}: ${heading.text}`,
					).toEqual([]);
					expect(
						heading.scrollWidth,
						`${pack}/${name}: heading must fit its card`,
					).toBeLessThanOrEqual(heading.width + 1);
					expect(heading.fontSize).toBeLessThanOrEqual(36);
					// Judge the rendered words and bounds above. Emergency wrapping for
					// oversized authored tokens must not be forbidden by a CSS-value check.
					if (pack === "depot") expect(heading.textTransform).toBe("none");
					if (pack === "journal") expect(heading.fontStyle).toBe("italic");
				}
				let cards: { x: number; y: number; width: number; height: number }[] =
					[];
				if (name === "core/bento-grid") {
					cards = await canvas
						.locator(".cp-library-bento > article")
						.evaluateAll((nodes) =>
							nodes.map((node) => {
								const box = node.getBoundingClientRect();
								return {
									x: box.x,
									y: box.y,
									width: box.width,
									height: box.height,
								};
							}),
						);
					await recordEvidence({ viewport, pack, name, phase: "cards", cards });
					expect(cards).toHaveLength(3);
					for (const card of cards) {
						expect(
							card.width,
							`${pack}/${name}: card has rendered width`,
						).toBeGreaterThan(0);
						expect(
							card.height,
							`${pack}/${name}: card has rendered height`,
						).toBeGreaterThan(0);
					}
					if (viewport.width === 1440) {
						expect(cards[0].width).toBeGreaterThan(cards[1].width * 1.9);
						expect(Math.abs(cards[1].y - cards[2].y)).toBeLessThanOrEqual(1);
						expect(
							Math.abs(cards[1].width - cards[2].width),
						).toBeLessThanOrEqual(1);
						expect(
							Math.abs(cards[1].height - cards[2].height),
						).toBeLessThanOrEqual(1);
					} else {
						expect(
							Math.abs(cards[0].width - cards[1].width),
						).toBeLessThanOrEqual(1);
						expect(cards[2].y).toBeGreaterThan(cards[1].y);
					}
				}
				const path = testInfo.outputPath(
					`card-polish-${viewport.width}-${pack}-${name.replaceAll("/", "-")}.png`,
				);
				await page
					.locator(".canonical-gallery")
					.screenshot({ path, animations: "disabled" });
				await recordEvidence({
					viewport,
					pack,
					name,
					phase: "capture",
					headings,
					cards,
					path,
				});
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth,
					),
				).toBe(true);
			}
		}
	}
	const path = testInfo.outputPath("card-typography-evidence.json");
	await writeFile(
		path,
		JSON.stringify(
			{ scope: "50-renderer card polish only", evidence },
			null,
			2,
		),
	);
	await testInfo.attach("card-typography-evidence.json", {
		path,
		contentType: "application/json",
	});
	expect(errors).toEqual([]);
});
