import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { discoverBlocks } from "./discovery.mjs";
import { z } from "./schema.mjs";
import { createBlockSpecCompiler, validateAuthoringActions, validateAuthoringFields, authoringFieldRules } from "./spec-runtime.mjs";
import tabbedSpec from "../../blocks/blocks/tabbed-content/block.json";
import { blockSchemas, validateBlockAuthoringAttrs } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/schemas";
import type { BlockName } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/types";

const root = fileURLToPath(new URL("../../", import.meta.url));
const runtime = createBlockSpecCompiler(z);

test("badge labels preserve historical blanks but require visible text for new authoring", () => {
  for (const label of [" ", "\t\n", "\u00a0", "\u200b", "\u2066\u2069"]) {
    const old = { items: [{ icon: "heart", label }] };
    expect(blockSchemas["core/trust-badges"].parse(old)).toEqual(old);
    expect(() => validateBlockAuthoringAttrs("core/trust-badges", old)).toThrow();
    expect(old.items[0].label).toBe(label);
  }
  for (const label of ["Made with care", "  Original work  ", "صنع بعناية", "手作り", "♥"])
    expect(validateBlockAuthoringAttrs("core/trust-badges", { items: [{ label }] })).toEqual({ items: [{ label }] });
});

test("trust icons remain readable for repair but unsupported authoring is refused", async () => {
  const spec = runtime.parseBlockSpec((await discoverBlocks(root)).blocks.find(b => b.spec.name === "core/trust-badges")!.spec);
  const old = { items: [{ icon: "old-provider-mark", label: "Historical badge" }] };
  expect(runtime.attrsSchema(spec.fields).parse(old)).toEqual(old);
  expect(() => validateBlockAuthoringAttrs(spec.name, old)).toThrow();
  for (const icon of [undefined, "heart", "check", "book-open"])
    expect(validateBlockAuthoringAttrs(spec.name, { items: [{ ...(icon ? { icon } : {}), label: "Sample badge" }] })).toEqual({ items: [{ ...(icon ? { icon } : {}), label: "Sample badge" }] });
});

test("write-only icon choices cover nested and scalar rows without rewriting legacy values", async () => {
  const original = (await discoverBlocks(root)).blocks.find(b => b.spec.name === "core/trust-badges")!.spec;
  const icon = { id: "icon", type: "icon", options: ["heart", "check"], optionsMode: "authoring", nullable: true };
  const fields = [{ id: "panel", type: "object", fields: [{ id: "rows", type: "repeater", fields: [icon] }, { id: "symbols", type: "repeater", item: { ...icon, required: true } }] }];
  const spec = runtime.parseBlockSpec({ ...original, fields, examples: [{}] });
  const schema = runtime.attrsSchema(spec.fields), choices = authoringFieldRules(spec.fields);
  expect(validateAuthoringFields(z, schema.parse({}), choices)).toEqual({});
  const valid = schema.parse({ panel: { rows: [{}, { icon: null }, { icon: "check" }], symbols: ["heart"] } });
  expect(validateAuthoringFields(z, valid, choices)).toBe(valid);
  const old = schema.parse({ panel: { rows: [{ icon: "old-icon" }], symbols: ["old-mark"] } });
  const before = JSON.stringify(old);
  try { validateAuthoringFields(z, old, choices); throw Error("Expected rejection"); } catch (error: any) {
    expect(error.issues.map((issue: any) => issue.path)).toEqual([["panel", "rows", 0, "icon"], ["panel", "symbols", 0]]);
  }
  expect(JSON.stringify(old)).toBe(before);
  for (const bad of [{ ...icon, options: undefined }, { ...icon, default: "old-icon" }])
    expect(() => runtime.parseBlockSpec({ ...original, fields: [bad], examples: [{}] })).toThrow();
  expect(() => runtime.parseBlockSpec({ ...original, fields: [icon], examples: [{ icon: "old-icon" }] })).toThrow();
});

test("nonblank rules validate nested defaults and examples while preserving optional and nullable values", async () => {
  const original = (await discoverBlocks(root)).blocks.find(b => b.spec.name === "core/trust-badges")!.spec;
  const label = { id: "label", type: "text", authoringNonblank: true, nullable: true };
  const fields = [{ id: "panel", type: "object", fields: [{ id: "labels", type: "repeater", item: { ...label, required: true } }] }];
  const spec = runtime.parseBlockSpec({ ...original, fields, examples: [{}] });
  const schema = runtime.attrsSchema(spec.fields), rules = authoringFieldRules(spec.fields);
  const valid = schema.parse({ panel: { labels: [null, "  Visible  "] } });
  expect(validateAuthoringFields(z, valid, rules)).toBe(valid);
  expect(validateAuthoringFields(z, schema.parse({}), rules)).toEqual({});
  expect(() => validateAuthoringFields(z, schema.parse({ panel: { labels: ["\u200b"] } }), rules)).toThrow("Enter visible text");
  expect(() => runtime.parseBlockSpec({ ...original, fields: [{ ...label, default: " " }], examples: [{}] })).toThrow();
  expect(() => runtime.parseBlockSpec({ ...original, fields: [label], examples: [{ label: " " }] })).toThrow();
});

test("social-proof additions retain absent historical fields and validate new content", async () => {
  const { blocks } = await discoverBlocks(root);
  const schemaFor = (name: string) => {
    const spec = runtime.parseBlockSpec(blocks.find(block => block.spec.name === name)!.spec);
    return { spec, schema: runtime.attrsSchema(spec.fields, spec.constraints) };
  };
  const stats = schemaFor("core/stats-band").schema;
  expect(stats.parse({ stats: [{ value: "12", label: "Workshops" }] }).stats[0]).not.toHaveProperty("note");
  expect(stats.parse({ stats: [{ note: "Illustrative figure" }] }).stats[0].note).toBe("Illustrative figure");
  const quotes = schemaFor("core/testimonials").schema;
  expect(quotes.parse({ items: [{ quote: "Existing words" }] }).items[0]).not.toHaveProperty("portrait");
  expect(quotes.parse({ items: [{ portrait: { id: "owned-media", alt: "Author portrait", focalPoint: { x: .4, y: .3 } } }] }).items[0].portrait.id).toBe("owned-media");
  const team = schemaFor("core/team-grid");
  expect(team.schema.parse({ members: [{ name: "Existing member" }] }).members[0]).not.toHaveProperty("links");
  const value = team.schema.parse({ members: [{ links: [{ label: "Contact", href: "mailto:example@example.test" }, { label: "Portfolio", href: "/work", newTab: true }] }] });
  expect(validateAuthoringActions(z, value, team.spec.authoringActions)).toEqual(value);
  expect(() => validateAuthoringActions(z, team.schema.parse({ members: [{ links: [{ label: "   ", href: "/work" }] }] }), team.spec.authoringActions)).toThrow();
});

test("feature icons and links and authored Bento sizes preserve old content and reject unsupported choices", async () => {
  const { blocks } = await discoverBlocks(root);
  for (const name of ["core/feature-grid", "core/bento-grid"]) {
    const spec = runtime.parseBlockSpec(blocks.find(block => block.spec.name === name)!.spec);
    const schema = runtime.attrsSchema(spec.fields, spec.constraints);
    const old = schema.parse({ items: [{ title: "An existing card" }] });
    const item = old.items[0];
    expect(Object.hasOwn(item, "icon")).toBe(false);
    expect(Object.hasOwn(item, "link")).toBe(false);
    expect(Object.hasOwn(item, "size")).toBe(false);
    if (name === "core/feature-grid") {
      for (const icon of ["book-open", "heart", "check"])
        expect(schema.parse({ items: [{ icon }] }).items[0].icon).toBe(icon);
      expect(() => schema.parse({ items: [{ icon: "not-in-this-kit" }] })).toThrow();
      const linked = schema.parse({ items: [{ link: { label: "Explore", href: "/studies", newTab: true } }] });
      expect(validateAuthoringActions(z, linked, spec.authoringActions)).toEqual(linked);
      for (const label of ["", "   "])
        expect(() => validateAuthoringActions(z, schema.parse({ items: [{ link: { label, href: "/studies" } }] }), spec.authoringActions)).toThrow();
      expect(() => schema.parse({ items: [{ link: { label: "Open", href: "javascript:alert(1)" } }] })).toThrow();
    } else {
      for (const size of ["auto", "standard", "wide"])
        expect(schema.parse({ items: [{ size }] }).items[0].size).toBe(size);
      expect(() => schema.parse({ items: [{ size: "arbitrary-css" }] })).toThrow();
    }
  }
});

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

test("Media + Text refuses unlabeled actions before writes without invalidating saved content", async () => {
  const spec = runtime.parseBlockSpec((await import("../../blocks/core/media-text/block.json")).default);
  const schema = runtime.attrsSchema(spec.fields, spec.constraints);
  const historical = schema.parse({ heading: "Studio visit", ctaUrl: "/visit", ctaLabel: "" });
  expect(historical.ctaUrl).toBe("/visit");
  expect(() => validateAuthoringActions(z, historical, spec.authoringActions)).toThrow();
  const valid = schema.parse({ ctaUrl: "/visit", ctaLabel: "Plan a visit" });
  expect(validateAuthoringActions(z, valid, spec.authoringActions)).toEqual(valid);
});

test("card families validate action labels before writes while preserving historical repair", async () => {
  const { blocks } = await discoverBlocks(root);
  for (const name of ["core/pricing-cards", "core/bento-grid", "core/feature-list-alternating"]) {
    const spec = runtime.parseBlockSpec(blocks.find(block => block.spec.name === name)!.spec);
    const schema = runtime.attrsSchema(spec.fields, spec.constraints);
    const collection = name === "core/pricing-cards" ? "plans" : "items";
    for (const ctaLabel of ["", "   "]) {
      const saved = schema.parse({ [collection]: [{ ctaUrl: "/page/studies", ctaLabel }] });
      const before = JSON.stringify(saved);
      expect(() => validateAuthoringActions(z, saved, spec.authoringActions), name).toThrow();
      expect(JSON.stringify(saved)).toBe(before);
    }
    for (const ctaUrl of ["", "/page/studies", "#studies", "mailto:studio@example.test", "tel:+18005550100"]) {
      const attrs = schema.parse({ [collection]: [{ ctaUrl, ctaLabel: "Explore the studies" }] });
      expect(validateAuthoringActions(z, attrs, spec.authoringActions)).toBe(attrs);
    }
  }
});
