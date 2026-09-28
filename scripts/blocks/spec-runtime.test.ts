import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { discoverBlocks } from "./discovery.mjs";
import { z } from "./schema.mjs";
import { createBlockSpecCompiler, validateAuthoringActions, validateAuthoringFields, authoringFieldRules } from "./spec-runtime.mjs";
import tabbedSpec from "../../blocks/blocks/tabbed-content/block.json";
import { blockSchemas, validateBlockAuthoringAttrs } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/schemas";
import type { BlockName } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/types";
import { DEFAULT_MENU_LOCATIONS } from "../../ConvexPress-Admin/packages/backend/convex/menus/validators";

const root = fileURLToPath(new URL("../../", import.meta.url));
const runtime = createBlockSpecCompiler(z);

test("a newly authored Menu resolves a registered location while old location values remain valid", () => {
  const attrs = validateBlockAuthoringAttrs("core/menu", {});
  expect(DEFAULT_MENU_LOCATIONS.map(location => location.slug)).toContain(attrs.location);
  expect(attrs.location).toBe("header");
  expect(validateBlockAuthoringAttrs("core/menu", { location: "primary" }).location).toBe("primary");
});

test("announcement authoring rejects equal and reversed dates without invalidating historical drafts", () => {
  for (const endsAt of ["2040-06-01T09:00:00Z", "2040-06-01T08:59:59Z"]) {
    const old = { text: "Historical notice", schedule: { startsAt: "2040-06-01T09:00:00Z", endsAt } };
    expect(blockSchemas["core/announcement-bar"].parse(old).schedule).toEqual(old.schedule);
    expect(() => validateBlockAuthoringAttrs("core/announcement-bar", old)).toThrow();
  }
  for (const schedule of [undefined, {}, { startsAt: "2040-06-01T09:00:00Z" }, { endsAt: "2040-06-01T10:00:00Z" }, { startsAt: "2040-06-01T09:00:00Z", endsAt: "2040-06-01T10:00:00Z" }]) {
    expect(validateBlockAuthoringAttrs("core/announcement-bar", { text: "Notice", ...(schedule ? { schedule } : {}) }).schedule).toEqual(schedule);
  }
});

test("shared authoring constraints validate nested dates and preserve read shape and error paths", () => {
  const fields = [{ id: "rows", type: "repeater", fields: [{ id: "schedule", type: "object", nullable: true, fields: [{ id: "startsAt", type: "date" }, { id: "endsAt", type: "date" }], authoringConstraints: [{ kind: "ordered", lower: "startsAt", upper: "endsAt" }] }] }];
  const spec = runtime.parseBlockSpec({ ...tabbedSpec, fields, authoringActions: [], examples: [{ rows: [{ schedule: null }] }], preview: "", searchText: [] });
  const schema = runtime.attrsSchema(spec.fields), rules = authoringFieldRules(spec.fields);
  const old = { rows: [{ schedule: { startsAt: "2040-06-01T09:00:00Z", endsAt: "2040-06-01T08:00:00Z" } }] };
  expect(schema.parse(old)).toEqual(old);
  try { validateAuthoringFields(z, old, rules); throw Error("Expected date order rejection"); } catch (error: any) {
    expect(error.issues[0].path).toEqual(["rows", 0, "schedule", "endsAt"]);
  }
  for (const value of [{}, { rows: [{}, { schedule: null }, { schedule: {} }] }]) expect(validateAuthoringFields(z, schema.parse(value), rules)).toEqual(value);
  expect(() => runtime.parseBlockSpec({ ...spec, examples: [old] })).toThrow();
  expect(() => runtime.parseBlockSpec({ ...spec, fields: [{ ...fields[0], default: old.rows }] })).toThrow();
  expect(() => runtime.parseBlockSpec({ ...spec, fields: [{ id: "value", type: "object", fields: [{ id: "title", type: "text" }], authoringConstraints: [{ kind: "ordered", lower: "title", upper: "missing" }] }] })).toThrow();
});

test("hero actions require visible labels and preserve existing content", () => {
  for (const name of ["core/hero", "core/hero-split", "core/hero-text-only"] as const) {
    for (const prefix of ["primary", "secondary"] as const) {
      const old = { [`${prefix}CtaUrl`]: "/contact", [`${prefix}CtaLabel`]: "\u200b" };
      expect(blockSchemas[name].parse(old)[`${prefix}CtaLabel`]).toBe("\u200b");
      expect(() => validateBlockAuthoringAttrs(name, old)).toThrow();
      expect(validateBlockAuthoringAttrs(name, { [`${prefix}CtaUrl`]: "#details", [`${prefix}CtaLabel`]: "Read the details" })[`${prefix}CtaLabel`]).toBe("Read the details");
    }
  }
});

test("optional hero titles may be absent but supplied titles must be visible", () => {
  for (const name of ["core/hero", "core/hero-split", "core/hero-text-only"] as const) {
    expect(validateBlockAuthoringAttrs(name, {}).title).toBeNull();
    expect(validateBlockAuthoringAttrs(name, { title: null }).title).toBeNull();
    for (const title of [" ", "\u200b", "\u2066\u2069"]) {
      expect(blockSchemas[name].parse({title}).title).toBe(title);
      expect(() => validateBlockAuthoringAttrs(name, {title})).toThrow();
    }
  }
});

test("split hero media position is optional on old content and has closed logical choices", () => {
  const old = blockSchemas["core/hero-split"].parse({ title: "An existing page" });
  expect(old).not.toHaveProperty("mediaSide");
  for (const mediaSide of ["start", "end"])
    expect(blockSchemas["core/hero-split"].parse({ mediaSide }).mediaSide).toBe(mediaSide);
  expect(() => blockSchemas["core/hero-split"].parse({ mediaSide: "arbitrary" })).toThrow();
});

test("CTA actions reject unnamed new links while historical attrs remain readable", () => {
  for (const prefix of ["primary", "secondary"] as const) {
    for (const label of ["", " ", "\u200b", "\u2066\u2069"]) {
      const old = { [`${prefix}CtaLabel`]: label, [`${prefix}CtaUrl`]: "/contact" };
      const stored = blockSchemas["core/cta-band"].parse(old);
      expect(stored[`${prefix}CtaLabel`]).toBe(label);
      expect(() => validateBlockAuthoringAttrs("core/cta-band", old)).toThrow();
      expect(old[`${prefix}CtaLabel`]).toBe(label);
    }
    for (const href of ["/contact", "#enquire", "https://example.com", "mailto:hello@example.com", "tel:+18005550100"])
      expect(validateBlockAuthoringAttrs("core/cta-band", { [`${prefix}CtaLabel`]: "Get in touch", [`${prefix}CtaUrl`]: href })[`${prefix}CtaUrl`]).toBe(href);
  }
  expect(validateBlockAuthoringAttrs("core/cta-band", { primaryCtaLabel: "Coming soon", primaryCtaUrl: "" }).primaryCtaLabel).toBe("Coming soon");
});

test("nested action labels reject invisible-only text without losing multilingual content", () => {
  const spec = runtime.parseBlockSpec(tabbedSpec);
  const schema = runtime.attrsSchema(spec.fields, spec.constraints);
  for (const label of ["\u200b", "\u2066\u2069", " \u200d "]) {
    const old = schema.parse({ tabs: [{ ctaUrl: "/contact", ctaLabel: label }] });
    try { validateAuthoringActions(z, old, spec.authoringActions); throw Error("Expected rejection"); } catch (error: any) {
      expect(error.issues[0].path).toEqual(["tabs", 0, "ctaLabel"]);
    }
    expect(old.tabs[0].ctaLabel).toBe(label);
  }
  for (const label of ["Contact", "تواصل معنا", "お問い合わせ", "👩‍💻", " Open "])
    expect(validateAuthoringActions(z, schema.parse({ tabs: [{ ctaUrl: "/contact", ctaLabel: label }] }), spec.authoringActions).tabs[0].ctaLabel).toBe(label);
});

test("inline signup labels require visible authored text without invalidating stored content", () => {
  for (const submitLabel of ["", " ", "\u200b", "\u2066\u2069"]) {
    expect(blockSchemas["core/cta-with-form"].parse({ submitLabel }).submitLabel).toBe(submitLabel);
    expect(() => validateBlockAuthoringAttrs("core/cta-with-form", { submitLabel })).toThrow();
  }
  expect(validateBlockAuthoringAttrs("core/cta-with-form", {}).submitLabel).toBe("Get started");
  expect(validateBlockAuthoringAttrs("core/cta-with-form", { submitLabel: "Subscribe" }).submitLabel).toBe("Subscribe");
});

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

test("process media is optional on historical steps and retains authored alt and focal values", () => {
  const old = { eyebrow: "Process", heading: "Make something", body: "", steps: [{ title: "Begin", body: "First line\n\nSecond line" }] };
  expect(blockSchemas["core/process-steps"].parse(old)).toEqual(old);
  const media = { id: "site-owned-image", alt: "A notebook", focalPoint: { x: .25, y: .75 } };
  const next = { ...old, steps: [{ ...old.steps[0], media }] };
  expect(validateBlockAuthoringAttrs("core/process-steps", next)).toEqual(next);
  expect(() => validateBlockAuthoringAttrs("core/process-steps", { ...old, steps: [{ ...old.steps[0], media: { ...media, focalPoint: { x: 2, y: .5 } } }] })).toThrow();
});

test("required media-step headings preserve history but reject invisible new authoring", () => {
  for (const title of [" ", "\u200b", "\u2066\u2069"]) {
    const old = { steps: [{ title }] };
    expect(blockSchemas["core/steps-with-media"].parse(old)).toEqual(old);
    expect(() => validateBlockAuthoringAttrs("core/steps-with-media", old)).toThrow();
  }
  const value = { steps: [{ title: "  手作り  " }] };
  expect(validateBlockAuthoringAttrs("core/steps-with-media", value)).toEqual(value);
});
