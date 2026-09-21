import { expect, test } from "bun:test";
import { editorDefinitions } from "../../../../../../blocks/.generated/editor-metadata";
import {
	managedBlocks,
	managedCategories,
	templateCoverage,
} from "./management-catalog";

test("management includes the full canonical catalog and categories beyond the legacy list", () => {
	expect(managedBlocks).toHaveLength(137);
	expect(new Set(managedBlocks.map((block) => block.name))).toEqual(
		new Set(Object.keys(editorDefinitions)),
	);
	expect(
		managedBlocks.find((block) => block.name === "blocks/studio-services")
			?.title,
	).toBeTruthy();
	expect(new Set(managedCategories.map((category) => category.key))).toEqual(
		new Set(managedBlocks.map((block) => block.category)),
	);
	for (const block of managedBlocks) {
		expect(block.description.length).toBeGreaterThan(0);
		expect(block.source.length).toBeGreaterThan(0);
	}
});

test("coverage never calls a missing renderer ready, and visibility is independent", () => {
	const block = { name: "core/heading", title: "Heading", hidden: false };
	expect(
		templateCoverage(block.name, [
			{ id: "one", title: "One", blocks: [{ ...block, renderer: "owned" }] },
			{
				id: "two",
				title: "Two",
				blocks: [{ ...block, hidden: true, renderer: "library" }],
			},
			{
				id: "three",
				title: "Three",
				blocks: [{ ...block, renderer: "missing" }],
			},
			{ id: "four", title: "Four", blocks: [] },
		]),
	).toEqual({ available: 2, total: 4 });
	expect(templateCoverage("unknown/block")).toEqual({ available: 0, total: 4 });
	expect(templateCoverage(block.name, [])).toEqual({ available: 0, total: 0 });
});
