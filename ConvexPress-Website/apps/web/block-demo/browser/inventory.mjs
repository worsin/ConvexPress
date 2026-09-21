import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

/** Independent source evidence. Never use generated coverage or browser discovery as the oracle. */
export async function discoverSourceInventory(root) {
	const specs = [];
	const renderers = [];
	for (const namespace of await readdir(root, { withFileTypes: true })) {
		if (!namespace.isDirectory() || namespace.name.startsWith(".")) continue;
		for (const block of await readdir(join(root, namespace.name), {
			withFileTypes: true,
		})) {
			if (!block.isDirectory()) continue;
			const directory = join(root, namespace.name, block.name);
			const files = await readdir(directory, { withFileTypes: true });
			const specFile = files.find((file) => file.name === "block.json");
			const rendererFile = files.find((file) => file.name === "render.tsx");
			if (!specFile && !rendererFile) continue;
			if (!specFile?.isFile())
				throw new Error(`Missing regular block.json: ${directory}`);
			const raw = await readFile(join(directory, "block.json"), "utf8");
			const spec = JSON.parse(raw);
			const name = `${namespace.name}/${block.name}`;
			if (
				spec.name !== name ||
				!Number.isInteger(spec.version) ||
				spec.version < 1
			)
				throw new Error(`Invalid canonical identity: ${directory}`);
			specs.push({ name, version: spec.version });
			if (rendererFile) {
				if (!rendererFile.isFile())
					throw new Error(`Renderer must be a regular file: ${directory}`);
				const source = await readFile(join(directory, "render.tsx"), "utf8");
				renderers.push({
					name,
					version: spec.version,
					source: `${name}/render.tsx`,
					sha256: createHash("sha256")
						.update(raw)
						.update("\0")
						.update(source)
						.digest("hex"),
				});
			}
		}
	}
	specs.sort((a, b) => a.name.localeCompare(b.name));
	renderers.sort((a, b) => a.name.localeCompare(b.name));
	if (!renderers.length)
		throw new Error("No canonical source renderers discovered");
	return { specs, renderers };
}

export function compareRendererInventory(expected, actual) {
	const expectedNames = new Set(expected.map((entry) => entry.name));
	const actualNames = new Set(actual);
	return {
		missing: [...expectedNames].filter((name) => !actualNames.has(name)).sort(),
		unexpected: [...actualNames]
			.filter((name) => !expectedNames.has(name))
			.sort(),
		duplicates: [...actualNames]
			.filter((name) => actual.filter((item) => item === name).length > 1)
			.sort(),
	};
}
