import { expect, test } from "bun:test";
import { attrsSchema, parseBlockSpec } from "./schema.mjs";
import { copyBlockSpecJson } from "./spec-runtime.mjs";

test("portable compiler preserves parsed defaults, nested constraints and strict object rejection", () => {
	const fields = [
		{
			id: "rows",
			type: "repeater",
			default: [{}],
			fields: [
				{ id: "name", type: "text", default: "New item", max: 20 },
				{ id: "start", type: "number", default: 1 },
				{ id: "end", type: "number", default: 3 },
			],
			constraints: [{ kind: "ordered", lower: "start", upper: "end" }],
		},
	];
	const schema = attrsSchema(fields);
	expect(schema.parse({})).toEqual({
		rows: [{ name: "New item", start: 1, end: 3 }],
	});
	expect(() => schema.parse({ rows: [{ start: 4, end: 2 }] })).toThrow();
	expect(() => schema.parse({ rows: [{ injected: true }] })).toThrow();
	expect(() =>
		attrsSchema([
			{
				id: "bad",
				type: "object",
				default: {},
				fields: [{ id: "required", type: "text", required: true }],
			},
		]).parse({}),
	).toThrow();
});

test("definition preflight never calls getters or toJSON and rejects non-JSON structures before recursion", () => {
	let calls = 0;
	const getter = Object.defineProperty({}, "title", {
		enumerable: true,
		get() {
			calls++;
			return "unsafe";
		},
	});
	const toJSON = {
		toJSON() {
			calls++;
			return {};
		},
	};
	const cycle: Record<string, unknown> = {};
	cycle.self = cycle;
	const sparse: unknown[] = [];
	sparse.length = 2;
	const augmented = [1];
	Object.assign(augmented, { extra: 2 });
	const hidden = Object.defineProperty({}, "title", { value: "hidden" });
	for (const value of [
		getter,
		toJSON,
		cycle,
		sparse,
		augmented,
		hidden,
		new Date(),
		{ x: undefined },
		{ x: NaN },
		{ x: Infinity },
		{ x: 1n },
		{ [Symbol("x")]: 1 },
		JSON.parse('{"__proto__":{}}'),
	]) {
		expect(() => copyBlockSpecJson(value)).toThrow();
		expect(() => parseBlockSpec(value)).toThrow();
	}
	expect(calls).toBe(0);
	const value = { nested: ["safe", 2, null] };
	const copy = copyBlockSpecJson(value);
	expect(copy).toEqual(value);
	expect(copy).not.toBe(value);
});

test("definition limits count UTF-8 bytes exactly and stop oversized or deeply nested inputs", () => {
	expect(copyBlockSpecJson("a".repeat(128 * 1024 - 2))).toHaveLength(
		128 * 1024 - 2,
	);
	expect(() => copyBlockSpecJson("a".repeat(128 * 1024 - 1))).toThrow(
		"128 KiB",
	);
	expect(() => copyBlockSpecJson("🪴".repeat(32768))).toThrow("128 KiB");
	let nested: unknown = {};
	for (let i = 0; i < 34; i++) nested = { child: nested };
	expect(() => copyBlockSpecJson(nested)).toThrow("complexity");
	expect(() => copyBlockSpecJson(Array(20001).fill(null))).toThrow(
		"complexity",
	);
});
