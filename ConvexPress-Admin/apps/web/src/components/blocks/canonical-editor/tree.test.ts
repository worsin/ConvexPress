import { expect, test } from "bun:test";
import { removeNodes } from "./tree";
import { changeNode, removeNode, outline, type TreeAdapter } from "./tree";
interface Node {
	id: string;
	body: string;
	anchor?: string;
	children?: Node[];
}
const adapter: TreeAdapter<Node> = {
	id: (n) => n.id,
	children: (n) => n.children ?? [],
	withChildren: (n, children) => ({ ...n, children }),
};
test("nested editing preserves identity, siblings and unrelated envelope fields", () => {
	const original: Node[] = [
		{
			id: "section",
			body: "",
			anchor: "story",
			children: [{ id: "text", body: "before" }],
		},
		{ id: "other", body: "untouched" },
	];
	const next = changeNode(original, "text", adapter, (n) => ({
		...n,
		body: "after",
	}));
	expect(next[0].children?.[0].body).toBe("after");
	expect(next[0].anchor).toBe("story");
	expect(next[1]).toBe(original[1]);
	expect(original[0].children?.[0].body).toBe("before");
	expect(
		outline(next, adapter).map((r) => [r.node.id, r.depth, r.parentId]),
	).toEqual([
		["section", 1, null],
		["text", 2, "section"],
		["other", 1, null],
	]);
});
test("missing, repeated and changed identities fail before applying selection", () => {
	const n = [{ id: "one", body: "" }];
	expect(() => changeNode(n, "missing", adapter, (x) => x)).toThrow();
	expect(() =>
		changeNode(n, "one", adapter, (x) => ({ ...x, id: "two" })),
	).toThrow();
	expect(() => outline([...n, ...n], adapter)).toThrow();
});
test("removing a container cannot remove a locked descendant and preserves unrelated siblings", () => {
	const nodes: Node[] = [
		{
			id: "group",
			body: "",
			anchor: "retained",
			children: [{ id: "locked", body: "protected" }],
		},
		{ id: "other", body: "other" },
	];
	expect(() =>
		removeNode(nodes, "group", adapter, (node) => node.id === "locked"),
	).toThrow();
	const next = removeNode(nodes, "locked", adapter);
	expect(next[0].anchor).toBe("retained");
	expect(next[0].children).toEqual([]);
	expect(next[1]).toBe(nodes[1]);
	expect(nodes[0].children?.length).toBe(1);
});

test("multi-remove is atomic, respects locked descendants and removes overlapping roots once", () => {
	type Branch = { id: string; children: Branch[] };
	const tree: Branch[] = [
		{ id: "a", children: [{ id: "nested", children: [] }] },
		{ id: "b", children: [] },
		{ id: "c", children: [] },
	];
	const shape = {
		id: (n: Branch) => n.id,
		children: (n: Branch) => n.children,
		withChildren: (n: Branch, children: typeof tree) => ({ ...n, children }),
	};
	expect(
		removeNodes(tree, ["a", "nested", "b"], shape).map((n) => n.id),
	).toEqual(["c"]);
	expect(() =>
		removeNodes(tree, ["a", "b"], shape, (n) => n.id === "nested"),
	).toThrow("locked");
	expect(() => removeNodes(tree, ["a", "missing"], shape)).toThrow("no longer");
	expect(tree.map((n) => n.id)).toEqual(["a", "b", "c"]);
	expect(tree[0]!.children).toHaveLength(1);
});
