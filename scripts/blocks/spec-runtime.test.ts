import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { discoverBlocks } from "./discovery.mjs";
import { z } from "./schema.mjs";
import { createBlockSpecCompiler, validateAuthoringActions } from "./spec-runtime.mjs";
import tabbedSpec from "../../blocks/blocks/tabbed-content/block.json";
import { blockSchemas } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/schemas";
import type { BlockName } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/types";

const root = fileURLToPath(new URL("../../", import.meta.url));
const runtime = createBlockSpecCompiler(z);

test("authoring action declarations bind real sibling fields and preserve read compatibility", () => {
  const spec = runtime.parseBlockSpec(tabbedSpec);
  const schema = runtime.attrsSchema(spec.fields, spec.constraints);
  for (const href of ["javascript:alert(1)", "//outside.test", "data:text/html,hello", " https://example.com", "https://example.com/\nnext", "/\\outside.test"]) {
    const old = schema.parse({ tabs: [{ ctaUrl: href, ctaLabel: "Open" }] });
    const before = JSON.stringify(old);
    expect(() => validateAuthoringActions(z, old, spec.authoringActions)).toThrow();
    expect(JSON.stringify(old)).toBe(before);
  }
  for (const ctaUrl of ["", "/page/example/", "#study", "https://example.com", "mailto:hello@example.com", "tel:+18005550100"]) {
    const attrs = schema.parse({ tabs: [{ ctaUrl, ctaLabel: "Open" }] });
    expect(validateAuthoringActions(z, attrs, spec.authoringActions)).toBe(attrs);
  }
  for (const action of [
    { path: ["missing"], href: "ctaUrl", label: "ctaLabel" },
    { path: ["tabs"], href: "ctaUrl", label: "ctaLabel" },
    { path: ["tabs", "*"], href: "mediaId", label: "ctaLabel" },
    { path: ["tabs", "*"], href: "ctaUrl", label: "ctaUrl" },
  ]) expect(() => runtime.parseBlockSpec({ ...tabbedSpec, authoringActions: [action] })).toThrow();
  expect(() => runtime.parseBlockSpec({ ...tabbedSpec, authoringActions: [...tabbedSpec.authoringActions, ...tabbedSpec.authoringActions] })).toThrow();
  expect(() => runtime.parseBlockSpec({ ...tabbedSpec, examples: [{ tabs: [{ ctaUrl: "/valid", ctaLabel: " " }] }] })).toThrow();
  const nested = runtime.parseBlockSpec({ ...tabbedSpec, fields: [{ id: "panel", type: "object", fields: tabbedSpec.fields }], preview: "", searchText: [], examples: [{}], authoringActions: [{ path: ["panel", "tabs", "*"], href: "ctaUrl", label: "ctaLabel" }] });
  const nestedSchema = runtime.attrsSchema(nested.fields);
  expect(validateAuthoringActions(z, nestedSchema.parse({}), nested.authoringActions)).toEqual({});
  expect(() => validateAuthoringActions(z, nestedSchema.parse({ panel: { tabs: [{ ctaUrl: "/valid", ctaLabel: "" }] } }), nested.authoringActions)).toThrow();
});

test("action protocol restrictions match web-only renderers without invalidating stored links", () => {
  const action = { path: ["tabs", "*"], href: "ctaUrl", label: "ctaLabel", protocols: ["http", "https", "relative", "anchor"] };
  const spec = runtime.parseBlockSpec({ ...tabbedSpec, authoringActions: [action] });
  const schema = runtime.attrsSchema(spec.fields, spec.constraints);
  for (const ctaUrl of ["mailto:hello@example.com", "tel:+18005550100"]) {
    const stored = schema.parse({ tabs: [{ ctaUrl, ctaLabel: "Open" }] });
    const before = JSON.stringify(stored);
    expect(() => validateAuthoringActions(z, stored, spec.authoringActions)).toThrow();
    expect(JSON.stringify(stored)).toBe(before);
    expect(validateAuthoringActions(z, stored, tabbedSpec.authoringActions)).toBe(stored);
  }
  for (const ctaUrl of ["", "/page/example/", "#study", "https://example.com", "http://example.com"]) {
    const stored = schema.parse({ tabs: [{ ctaUrl, ctaLabel: "Open" }] });
    expect(validateAuthoringActions(z, stored, spec.authoringActions)).toBe(stored);
  }
  for (const protocols of [[], ["https", "https"], ["javascript"], ["ftp"]])
    expect(() => runtime.parseBlockSpec({ ...tabbedSpec, authoringActions: [{ ...action, protocols }] })).toThrow();
  expect(() => runtime.parseBlockSpec({ ...spec, examples: [{ tabs: [{ ctaUrl: "tel:+18005550100", ctaLabel: "Call" }] }] })).toThrow();
});

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
