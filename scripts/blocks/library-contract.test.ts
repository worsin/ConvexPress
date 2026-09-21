import { expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseBlockSpec, attrsSchema, z } from "./schema.mjs";
import { anchorFields } from "./spec-runtime.mjs";
import {
	createCanonicalNodeSchema,
	validateCanonicalTree,
} from "./instance-runtime.mjs";
import type { CanonicalTreeContract } from "./instance-runtime.mjs";
import type { BlockSpec } from "./spec-runtime.mjs";

// Validate the source inventory without depending on generated catalogs or renderers.
// New block folders join the same check without another hand-maintained name list.
test("every Library specification and example satisfies its canonical document contract", async () => {
	const directory = fileURLToPath(new URL("../../blocks/", import.meta.url));
	const specifications: BlockSpec[] = [];
	for (const namespace of await readdir(directory, { withFileTypes: true })) {
		if (!namespace.isDirectory() || namespace.name.startsWith(".")) continue;
		for (const block of await readdir(path.join(directory, namespace.name), {
			withFileTypes: true,
		})) {
			if (!block.isDirectory() || block.name.startsWith(".")) continue;
			const file = path.join(
				directory,
				namespace.name,
				block.name,
				"block.json",
			);
			const specification = parseBlockSpec(
				JSON.parse(await readFile(file, "utf8")),
			);
			expect(specification.name).toBe(`${namespace.name}/${block.name}`);
			specifications.push(specification);
		}
	}
	expect(specifications.length).toBeGreaterThan(0);
	expect(
		new Set(specifications.map((specification) => specification.name)).size,
	).toBe(specifications.length);
	const schemas = new Map(
		specifications.map((specification) => [
			specification.name,
			attrsSchema(specification.fields, specification.constraints),
		]),
	);
	const contract: CanonicalTreeContract = {
		nodeSchema: createCanonicalNodeSchema(z),
		descriptors: Object.fromEntries(
			specifications.map((specification) => [
				specification.name,
				{ version: specification.version, supports: specification.supports },
			]),
		),
		anchors: Object.fromEntries(
			specifications.map((specification) => [
				specification.name,
				anchorFields(specification.fields),
			]),
		),
		validateAttrs: (name, attrs) => {
			const schema = schemas.get(name);
			if (!schema) throw new Error(`Unknown source contract: ${name}`);
			return schema.parse(attrs);
		},
	};
	for (const specification of specifications) {
		const schema = schemas.get(specification.name)!;
		for (const attrs of specification.examples) {
			const input = [
				{
					id: "example",
					name: specification.name,
					version: specification.version,
					attrs,
				},
			];
			const before = structuredClone(input);
			const result = validateCanonicalTree(input, contract);
			expect(result[0].attrs, specification.name).toEqual(schema.parse(attrs));
			expect(input, `${specification.name}: source preservation`).toEqual(
				before,
			);
		}
	}
});
