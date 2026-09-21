import { createRequire } from "node:module";
import { writeThumbnailIndex } from "./thumbnail-catalog.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = process.env.BLOCK_DEMO_URL ?? "http://127.0.0.1:4318";
const u = new URL(origin);
assert(
	u.protocol === "http:" &&
		["127.0.0.1", "localhost", "[::1]"].includes(u.hostname),
	"Use the owned loopback BlockDemo",
);
const output = path.join(
	root,
	"ConvexPress-Admin/apps/web/public/block-thumbnails",
);
await fs.mkdir(output, { recursive: true });
const catalog = JSON.parse(
	await fs.readFile(path.join(root, "blocks/.generated/catalog.json"), "utf8"),
);
const { chromium } = createRequire(
	path.join(root, "ConvexPress-Admin/apps/web/package.json"),
)("@playwright/test");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
	viewport: { width: 1100, height: 900 },
	deviceScaleFactor: 1,
	reducedMotion: "reduce",
});
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const manifest = {
	version: 1,
	capturedAt: new Date().toISOString(),
	specimens: "Synthetic BlockDemo examples; cropped to first 480px",
	packs: {},
};
try {
	await page.goto(origin, { waitUntil: "networkidle" });
	await page.locator("#pack").waitFor();
	const packs = await page
		.locator("#pack option")
		.evaluateAll((ns) => ns.map((n) => n.value));
	assert(packs.length > 0, "No installed template packs");
	assert.equal(
		await page.locator("#canonical-block option").count(),
		catalog.length,
	);
	await page.addStyleTag({
		content:
			".canonical-canvas{width:800px!important;max-width:none!important;max-height:480px!important;overflow:hidden!important}.canonical-canvas [data-demo-controls]{display:none!important}",
	});
	for (const pack of packs) {
		manifest.packs[pack] = {};
		await fs.mkdir(path.join(output, pack), { recursive: true });
		await page.locator("#pack").selectOption(pack);
		await page.evaluate(() => document.fonts.ready);
		for (const [index, spec] of catalog.entries()) {
			await page.locator("#canonical-block").selectOption(spec.name);
			const example = Math.min(1, spec.examples.length - 1);
			await page.locator("#canonical-example").selectOption(String(example));
			const canvas = page.locator(".canonical-canvas");
			assert.equal(
				await canvas.getAttribute("data-canonical-block"),
				spec.name,
			);
			await canvas.scrollIntoViewIfNeeded();
			await canvas.evaluate(async (el) => {
				await document.fonts.ready;
				await Promise.all(
					Array.from(el.querySelectorAll("img")).map((i) =>
						i.decode().catch(() => {}),
					),
				);
				await new Promise((r) =>
					requestAnimationFrame(() => requestAnimationFrame(r)),
				);
			});
			assert.equal(await canvas.locator(".block-not-ready").count(), 0);
			const file = pack + "/" + spec.name.replaceAll("/", "--") + ".jpg";
			const image = await canvas.screenshot({
				type: "jpeg",
				quality: 78,
				animations: "disabled",
			});
			await fs.writeFile(path.join(output, file), image);
			manifest.packs[pack][spec.name] = {
				src: "/block-thumbnails/" + file,
				example,
				sha256: crypto.createHash("sha256").update(image).digest("hex"),
				bytes: image.length,
			};
			if (index % 25 === 0)
				console.log(
					JSON.stringify({ pack, captured: index + 1, total: catalog.length }),
				);
		}
		console.log(JSON.stringify({ pack, complete: catalog.length }));
	}
	assert.deepEqual(errors, []);
	await fs.writeFile(
		path.join(output, "manifest.json"),
		JSON.stringify(manifest, null, 2) + "\n",
	);
	await writeThumbnailIndex(catalog, manifest);
	console.log(
		JSON.stringify({
			complete: true,
			packs: Object.keys(manifest.packs).length,
			blocks: catalog.length,
			errors,
		}),
	);
} finally {
	await browser.close();
}
