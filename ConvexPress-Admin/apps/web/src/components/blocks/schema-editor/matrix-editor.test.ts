// @ts-ignore The local bun:test shim omits the supported afterAll lifecycle hook.
import { afterAll, expect, test } from "bun:test";
import { editorDefinitions } from "../../../../../../../blocks/.generated/editor-metadata";
import { loadStaged } from "./test-harness";
const loaded = await loadStaged("./matrix-editor.ts");
afterAll(loaded.cleanup);
const { editRepeater, repeaterEditAllowed } = loaded.module;

for (const name of [
	"core/table",
	"core/comparison-table",
	"core/pricing-table",
] as const) {
	const definition = editorDefinitions[name];
	const headers = name === "core/pricing-table" ? "plans" : "columns";
	const offset = name === "core/comparison-table" ? 1 : 0;
	const rowField =
		name === "core/table"
			? undefined
			: name === "core/comparison-table"
				? "cells"
				: "values";
	const first = name === "core/pricing-table" ? { name: "First" } : "First";
	const added = name === "core/pricing-table" ? { name: "Second" } : "Second";
	const values = (row: Record<string, unknown> | unknown[]) =>
		rowField ? (row as Record<string, unknown>)[rowField] : row;
	test(`${name} adds aligned cells and rows without changing prior content`, () => {
		const draft = {
			[headers]: offset ? ["Feature", first] : [first],
			rows: [
				rowField
					? { label: "Detail", [rowField]: ["Original"], retained: true }
					: ["Original"],
			],
			retained: { author: "Kept" },
		};
		const original = structuredClone(draft);
		const column = editRepeater(
			draft,
			[headers],
			{ kind: "append", value: added },
			definition,
		);
		expect(values(column.rows[0])).toEqual(["Original", ""]);
		expect(column[headers]).toEqual(
			offset ? ["Feature", first, added] : [first, added],
		);
		expect(draft).toEqual(original);
		const row = editRepeater(
			column,
			["rows"],
			{
				kind: "append",
				value: rowField ? { label: "New", [rowField]: [] } : [],
			},
			definition,
		);
		expect(values(row.rows[1])).toEqual(["", ""]);
		expect(row.rows[0]).toEqual(column.rows[0]);
		expect(row.retained).toEqual(original.retained);
	});
	test(`${name} refuses column changes over malformed rows rather than truncating data`, () => {
		const draft = {
			[headers]: offset ? ["Feature", first] : [first],
			rows: [
				rowField
					? { label: "Detail", [rowField]: ["Original", "Must not disappear"] }
					: ["Original", "Must not disappear"],
			],
		};
		const before = structuredClone(draft);
		expect(
			repeaterEditAllowed(
				draft,
				[headers],
				{ kind: "append", value: added },
				definition,
			),
		).toBe(false);
		expect(() =>
			editRepeater(
				draft,
				[headers],
				{ kind: "remove", index: offset },
				definition,
			),
		).toThrow();
		expect(draft).toEqual(before);
	});
}
test("comparison row labels remain fixed while ordinary nested repeaters still reorder", () => {
	const definition = editorDefinitions["core/comparison-table"];
	const draft = {
		columns: ["Feature", "One", "Two"],
		rows: [{ label: "A", cells: ["1", "2"] }],
	};
	for (const operation of [
		{ kind: "move", from: 0, to: 1 },
		{ kind: "move", from: 1, to: 0 },
		{ kind: "remove", index: 0 },
	])
		expect(repeaterEditAllowed(draft, ["columns"], operation, definition)).toBe(
			false,
		);
	expect(
		editRepeater(
			draft,
			["rows", 0, "cells"],
			{ kind: "move", from: 0, to: 1 },
			definition,
		).rows[0].cells,
	).toEqual(["2", "1"]);
});
