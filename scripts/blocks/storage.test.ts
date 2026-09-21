import { expect, test } from "bun:test";
import { z } from "./schema.mjs";
import { createCanonicalNodeSchema } from "./instance-runtime.mjs";
import { canonicalStorageValidatorSource } from "./storage.mjs";
import { v } from "../../ConvexPress-Admin/node_modules/convex/values";

test("storage envelope is mechanically derived from the same closed node schema", () => {
	const code = canonicalStorageValidatorSource();
	const validator = new Function("v", `return ${code}`)(v);
	const fields = validator.fields;
	const shape = z.toJSONSchema(createCanonicalNodeSchema(z));
	expect(Object.keys(fields).sort()).toEqual(
		Object.keys(shape.properties).sort(),
	);
	expect(fields.children.isOptional).toBe("optional");
	expect(fields.children.element.kind).toBe("any");
	expect(fields.attrs.kind).toBe("record");
	expect(
		fields.layout.fields.tone.members.map((item: any) => item.value),
	).toEqual(shape.properties.layout.properties.tone.enum);
	expect(fields.visibility.members.map((item: any) => item.value)).toEqual([
		"everyone",
		"signedIn",
		"signedOut",
	]);
	expect(fields.innerBlocks).toBeUndefined();
});
