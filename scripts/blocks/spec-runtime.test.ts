import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { discoverBlocks } from "./discovery.mjs";
import { z } from "./schema.mjs";
import { createBlockSpecCompiler } from "./spec-runtime.mjs";
import { blockSchemas } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/schemas";
import type { BlockName } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/types";

const root = fileURLToPath(new URL("../../", import.meta.url));
const runtime = createBlockSpecCompiler(z);

test("runtime compilation matches shipped generated validators for every example and invalid field", async () => {
	const { blocks } = await discoverBlocks(root);
	expect(blocks).toHaveLength(137);
	let examples = 0;
	for (const { spec: input } of blocks) {
		const spec = runtime.parseBlockSpec(input);
		const before = JSON.stringify(spec);
		const dynamic = runtime.attrsSchema(spec.fields, spec.constraints);
		const generated = blockSchemas[spec.name as BlockName];
		const probes: unknown[] = [
			...spec.examples,
			{},
			{ unexpectedField: true },
			null,
			[],
		];
		examples += spec.examples.length;
		for (const example of spec.examples)
			for (const field of spec.fields) {
				for (const bad of [null, [], {}, false, 1, "javascript:alert(1)"])
					probes.push({ ...example, [field.id]: bad });
				const absent = { ...example };
				delete absent[field.id];
				probes.push(absent);
			}
		for (const value of probes) {
			const actual = dynamic.safeParse(value),
				expected = generated.safeParse(value);
			expect(actual.success, spec.name).toBe(expected.success);
			if (actual.success && expected.success)
				expect(actual.data, spec.name).toEqual(expected.data);
		}
		expect(JSON.stringify(spec)).toBe(before);
	}
	expect(examples).toBe(285);
});
