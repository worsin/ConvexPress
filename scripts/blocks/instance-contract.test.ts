import { expect, test } from "bun:test";
import { z } from "./schema.mjs";
import {
	createCanonicalNodeSchema,
	validateCanonicalTree,
	CanonicalTreeError,
} from "./instance-runtime.mjs";
import type { CanonicalTreeContract } from "./instance-runtime.mjs";

const supports = {
	children: true,
	styles: true,
	layout: ["width"],
	anchor: true,
	visibility: true,
};
const contract: CanonicalTreeContract = {
	nodeSchema: createCanonicalNodeSchema(z),
	descriptors: { "example/group": { version: 1, supports } },
	anchors: { "example/group": [{ path: ["target"] }] },
	validateAttrs: (_name, attrs) =>
		z
			.object({
				text: z.string().default("New section"),
				target: z.string().optional(),
			})
			.strict()
			.parse(attrs),
};
const node = (id: string) => ({
	id,
	name: "example/group",
	version: 1,
	attrs: {},
});
const code = (tree: unknown, expected: string, rules = contract) => {
	try {
		validateCanonicalTree(tree, rules);
		throw new Error("Invalid document was accepted");
	} catch (error) {
		expect(error).toBeInstanceOf(CanonicalTreeError);
		expect((error as CanonicalTreeError).code).toBe(expected);
	}
};

test("canonical documents retain identity, nested content, defaults and saved template intent", () => {
	const input = [
		{
			...node("outer"),
			layout: { width: "wide" },
			style: "another-template-style",
			children: [node("inner")],
		},
	];
	const before = structuredClone(input);
	const parsed = validateCanonicalTree(input, contract);
	expect(parsed[0].attrs).toEqual({ text: "New section" });
	expect(parsed[0].children?.[0]).toEqual({
		...node("inner"),
		attrs: { text: "New section" },
	});
	expect(parsed[0].style).toBe("another-template-style");
	expect(parsed[0].layout).toEqual({ width: "wide" });
	expect(input).toEqual(before);
});

test("document envelopes reject unsupported policy, vocabulary, versions and duplicate page identities", () => {
	code([{ ...node("a"), extra: true }], "INVALID_INSTANCE");
	code([{ ...node("a"), name: "unknown/block" }], "UNKNOWN_BLOCK");
	code([{ ...node("a"), version: 2 }], "VERSION_MISMATCH");
	for (const visibility of ["everyone", "signedIn", "signedOut"]) expect(validateCanonicalTree([{ ...node("a"), visibility }], contract)[0].visibility).toBe(visibility);
	expect(validateCanonicalTree([{ ...node("a"), lock: { edit: true, move: true, remove: true } }], contract)[0].lock).toEqual({ edit: true, move: true, remove: true });
	code([{ ...node("a"), layout: { tone: "muted" } }], "UNSUPPORTED_LAYOUT");
	code([{ ...node("a"), attrs: { unexpected: true } }], "INVALID_ATTRS");
	code([node("a"), node("a")], "DUPLICATE_BLOCK_ID");
	code(
		[
			{ ...node("a"), attrs: { target: "same" } },
			{ ...node("b"), anchor: "same" },
		],
		"DUPLICATE_ANCHOR",
	);
});

test("documents enforce aggregate budgets before and after defaults without truncating content", () => {
	code(
		Array.from({ length: 81 }, (_, index) => node(`item${index}`)),
		"TREE_BUDGET",
	);
	let nested: unknown = node("leaf");
	for (let index = 0; index < 8; index++)
		nested = { ...node(`group${index}`), children: [nested] };
	code([nested], "TREE_BUDGET");
	code(
		[{ ...node("a"), attrs: { text: "x".repeat(512 * 1024) } }],
		"TREE_BUDGET",
	);
	code([node("a")], "TREE_BUDGET", {
		...contract,
		validateAttrs: () => ({ text: "x".repeat(512 * 1024) }),
	});
	const cycle: Record<string, unknown> = node("a");
	cycle.children = [cycle];
	code([cycle], "INVALID_JSON");
});

test("only the host can extend unknown composed names and cannot replace installed contracts", () => {
	let resolves = 0;
	const extended: CanonicalTreeContract = {
		...contract,
		resolveComposedBlock: (name, version) => {
			resolves++;
			return name === "composed/banner" && version === 3
				? {
						descriptor: { version: 3, supports },
						anchors: [],
						validateAttrs: (value) =>
							z.object({ label: z.string() }).strict().parse(value),
					}
				: undefined;
		},
	};
	const composed = {
		...node("a"),
		name: "composed/banner",
		version: 3,
		attrs: { label: "Welcome" },
	};
	code([composed], "UNKNOWN_BLOCK");
	expect(validateCanonicalTree([composed], extended)[0].attrs).toEqual({
		label: "Welcome",
	});
	expect(resolves).toBe(1);
	validateCanonicalTree([node("b")], extended);
	expect(resolves).toBe(1);
	code([{ ...composed, version: 4 }], "UNKNOWN_BLOCK", extended);
});
