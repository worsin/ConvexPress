import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = path.join(
	root,
	"ConvexPress-Admin/apps/web/public/block-thumbnails",
);
const indexPath = path.join(
	root,
	"ConvexPress-Admin/apps/web/src/components/blocks/canonical-editor/block-thumbnails.generated.json",
);
export function thumbnailIndex(catalog, manifest) {
	return Object.fromEntries(
		catalog.map((spec) => [
			spec.name,
			{
				category: spec.category,
				description: spec.description,
				keywords: spec.keywords ?? [],
				previews: Object.fromEntries(
					Object.entries(manifest.packs).map(([pack, items]) => [
						pack,
						items[spec.name].src,
					]),
				),
			},
		]),
	);
}
export async function writeThumbnailIndex(catalog, manifest) {
	await fs.writeFile(
		indexPath,
		JSON.stringify(thumbnailIndex(catalog, manifest), null, 2) + "\n",
	);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const catalog = JSON.parse(
			await fs.readFile(
				path.join(root, "blocks/.generated/catalog.json"),
				"utf8",
			),
		),
		manifest = JSON.parse(
			await fs.readFile(path.join(folder, "manifest.json"), "utf8"),
		);
	const packs = await fs.readdir(
		path.join(root, "ConvexPress-Website/apps/web/src/templates/packs"),
	);
	const expected = [];
	for (const pack of packs) {
		try {
			const m = JSON.parse(
				await fs.readFile(
					path.join(
						root,
						"ConvexPress-Website/apps/web/src/templates/packs",
						pack,
						"template.json",
					),
					"utf8",
				),
			);
			expected.push(m.id);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	assert.deepEqual(Object.keys(manifest.packs).sort(), expected.sort());
	let images = 0,
		bytes = 0;
	for (const [pack, items] of Object.entries(manifest.packs)) {
		assert.deepEqual(
			Object.keys(items).sort(),
			catalog.map((s) => s.name).sort(),
		);
		for (const spec of catalog) {
			const item = items[spec.name],
				file = pack + "/" + spec.name.replaceAll("/", "--") + ".jpg";
			assert.equal(item.src, "/block-thumbnails/" + file);
			assert(item.example >= 0 && item.example < spec.examples.length);
			const data = await fs.readFile(path.join(folder, file));
			assert.equal(
				crypto.createHash("sha256").update(data).digest("hex"),
				item.sha256,
			);
			assert.equal(data.length, item.bytes);
			images++;
			bytes += data.length;
		}
	}
	if (process.argv.includes("--write-index"))
		await writeThumbnailIndex(catalog, manifest);
	else
		assert.deepEqual(
			JSON.parse(await fs.readFile(indexPath, "utf8")),
			thumbnailIndex(catalog, manifest),
		);
	console.log(
		JSON.stringify({
			blocks: catalog.length,
			packs: expected.length,
			images,
			bytes,
			status: "passed",
		}),
	);
}
