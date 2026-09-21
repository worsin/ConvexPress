import { describe, expect, test } from "bun:test";
import { parseBlockSpec, attrsSchema, blockSpecJsonSchema } from "./schema.mjs";

export const sample = () => ({
	name: "core/example",
	title: "Example",
	description: "Schema test",
	category: "content",
	role: "content",
	version: 1,
	keywords: [],
	ai: { useFor: "Testing", avoid: "Production" },
	fields: [{ id: "title", type: "text", required: true, max: 40 }],
	supports: {
		children: false,
		styles: true,
		layout: ["width"],
		anchor: true,
		visibility: true,
	},
	data: null,
	preview: "{title}",
	examples: [{ title: "Example" }],
});
const valid = () => ({ ...sample(), category: "marketing" });
describe("closed block specification", () => {
	test("rejects unknown fields, types, categories, duplicate IDs and invalid examples", () => {
		expect(() => parseBlockSpec(valid())).not.toThrow();
		for (const mutation of [
			(s: any) => {
				s.category = "content";
			},
			(s: any) => {
				s.css = "red";
			},
			(s: any) => {
				s.fields[0].type = "javascript";
			},
			(s: any) => {
				s.fields[0].pixels = 4;
			},
			(s: any) => {
				s.fields.push({ ...s.fields[0] });
			},
			(s: any) => {
				s.examples = [{}];
			},
			(s: any) => {
				s.examples[0].title = "x".repeat(41);
			},
			(s: any) => {
				s.examples[0].className = "red";
			},
			(s: any) => {
				s.fields[0].default = 123;
			},
			(s: any) => {
				s.preview = "{missing}";
			},
			(s: any) => {
				s.data = {
					resolver: "events.upcoming",
					args: { count: "attrs.missing" },
				};
			},
			(s: any) => {
				s.preview = "{title";
			},
			(s: any) => {
				s.fields[0].min = 50;
			},
			(s: any) => {
				s.fields[0].id = "constructor";
			},
		]) {
			const s = valid();
			mutation(s);
			expect(() => parseBlockSpec(s)).toThrow();
		}
		expect(blockSpecJsonSchema.additionalProperties).toBe(false);
	});
	test("field depth and work budgets fail closed", () => {
		let nested: any = { id: "value", type: "text" };
		for (let depth = 0; depth < 10; depth++)
			nested = { id: "nested", type: "object", fields: [nested] };
		expect(() =>
			parseBlockSpec({
				...valid(),
				fields: [nested],
				examples: [{}],
				preview: "",
			}),
		).toThrow("depth");
		const fields = Array.from({ length: 100 }, (_, i) => ({
			id: `group${i}`,
			type: "object",
			fields: Array.from({ length: 6 }, (_, j) => ({
				id: `value${j}`,
				type: "text",
			})),
		}));
		expect(() =>
			parseBlockSpec({ ...valid(), fields, examples: [{}], preview: "" }),
		).toThrow("500 fields");
	});
	test("object and repeater defaults are parsed through child defaults, with no executable author text", () => {
		const codeLike = '"); throw new Error("executed"); //';
		const spec = parseBlockSpec({
			...valid(),
			preview: "",
			examples: [{}],
			fields: [
				{
					id: "object",
					type: "object",
					default: {},
					fields: [{ id: "text", type: "text", default: codeLike }],
				},
				{
					id: "items",
					type: "repeater",
					default: [{}],
					fields: [{ id: "count", type: "number", default: 2, integer: true }],
				},
			],
		});
		expect(attrsSchema(spec.fields).parse({})).toEqual({
			object: { text: codeLike },
			items: [{ count: 2 }],
		});
	});
	test("all closed field types enforce nested constraints, defaults, nullability and safe links", () => {
		const fields = [
			{ id: "text", type: "text", max: 5, default: "Hello" },
			{ id: "number", type: "number", integer: true, min: 1, max: 3 },
			{ id: "bool", type: "boolean" },
			{ id: "select", type: "select", options: ["one", "two"] },
			{ id: "link", type: "link" },
			{ id: "media", type: "media" },
			{ id: "icon", type: "icon" },
			{ id: "tone", type: "color-role" },
			{ id: "date", type: "date" },
			{ id: "ref", type: "reference", of: "post" },
			{ id: "menu", type: "menu" },
			{ id: "form", type: "form" },
			{ id: "rich", type: "richtext", max: 12 },
			{ id: "note", type: "text", nullable: true },
			{
				id: "items",
				type: "repeater",
				max: 2,
				fields: [{ id: "title", type: "text", required: true }],
			},
			{
				id: "obj",
				type: "object",
				fields: [{ id: "count", type: "number", min: 1 }],
			},
		];
		const s = parseBlockSpec({
			...valid(),
			fields,
			preview: "{text}",
			examples: [{}],
		});
		const schema = attrsSchema(s.fields);
		expect(schema.parse({})).toEqual({ text: "Hello" });
		expect(
			schema.parse({
				note: null,
				ref: "post-id",
				media: { id: "media-id", alt: "Image" },
				rich: {
					type: "doc",
					content: [
						{ type: "paragraph", content: [{ type: "text", text: "Hi" }] },
					],
				},
			}).note,
		).toBeNull();
		for (const bad of [
			{ number: 1.5 },
			{ number: 4 },
			{ bool: "true" },
			{ select: "three" },
			{ link: { label: "Bad", href: "javascript:alert(1)" } },
			{ media: { id: "m", className: "bad" } },
			{ tone: "#fff" },
			{ date: "2026-02-30" },
			{ ref: 2 },
			{ menu: "" },
			{ icon: "<script>" },
			{ items: [{}] },
			{ obj: { count: 0 } },
			{ rich: { type: "doc", content: [{ type: "html", text: "bad" }] } },
		])
			expect(schema.safeParse(bad).success).toBe(false);
	});
});

test("semantic constraints and runtime requirements are closed and refer to actual typed fields", () => {
	const base = valid();
	for (const overrides of [
		{ requires: { plugins: [], capabilities: ["execute.arbitraryCode"] } },
		{
			requires: {
				plugins: [],
				capabilities: ["html.sanitize", "html.sanitize"],
			},
		},
		{ requires: { plugins: ["../foreign"], capabilities: [] } },
		{ constraints: [{ kind: "at-most-one", fields: ["title", "missing"] }] },
		{ constraints: [{ kind: "matrix", headers: "title", rows: "title" }] },
		{ constraints: [{ kind: "ordered", lower: "title", upper: "title" }] },
		{ constraints: [{ kind: "javascript", code: "run()" }] },
		{
			fields: [{ id: "url", type: "link", protocols: ["javascript"] }],
			examples: [{}],
			preview: "",
		},
		{
			fields: [{ id: "ref", type: "reference", of: "customerToken" }],
			examples: [{}],
			preview: "",
		},
	])
		expect(() => parseBlockSpec({ ...base, ...overrides })).toThrow();
});

test("requirements preserve registered camel-case plugin IDs and distinguish KB category references", () => {
	const spec = {
		...valid(),
		requires: {
			plugins: ["knowledgeBase"],
			capabilities: ["reference.targetResolution"],
		},
		fields: [
			{ id: "category", type: "reference", of: "kbCategory", storage: "id" },
		],
		preview: "Help",
		examples: [{}],
	};
	expect(parseBlockSpec(spec).requires.plugins).toEqual(["knowledgeBase"]);
	expect(() =>
		parseBlockSpec({
			...spec,
			requires: { plugins: ["../knowledgeBase"], capabilities: [] },
		}),
	).toThrow();
});
