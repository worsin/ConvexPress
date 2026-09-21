import { usesOriginalArticleEditor } from "./legacy-article";

export function usesOriginalTextEditor(
	source: Parameters<typeof usesOriginalArticleEditor>[0] & {
		blocks?: unknown;
		blocksVersion?: number;
	},
): boolean {
	return (
		source.blocksVersion !== 2 &&
		!usesOriginalArticleEditor(source) &&
		(source.contentMode === "article" ||
			!Array.isArray(source.blocks) ||
			source.blocks.length === 0)
	);
}

type Node = {
	type?: string;
	text?: string;
	content?: Node[];
	[key: string]: unknown;
};
export type OriginalText =
	| { kind: "plain"; text: string }
	| { kind: "unsupported" }
	| {
			kind: "document";
			document: Node;
			segments: { path: number[]; text: string }[];
	  };

/** Edit text in place; never flatten lists, marks, images or unfamiliar nodes. */
export function readOriginalText(value: string): OriginalText {
	if (!value.trim()) return { kind: "plain", text: value };
	let document: Node;
	try {
		document = JSON.parse(value);
	} catch {
		return /^\s*[[{]/u.test(value)
			? { kind: "unsupported" }
			: { kind: "plain", text: value };
	}
	// A number, boolean or quoted sentence is still ordinary authored text.
	if (document === null || typeof document !== "object")
		return { kind: "plain", text: value };
	if (document.type !== "doc" || !Array.isArray(document.content))
		return { kind: "unsupported" };
	const segments: { path: number[]; text: string }[] = [];
	const pending: { node: Node; path: number[] }[] = [
		{ node: document, path: [] },
	];
	let count = 0;
	while (pending.length) {
		const current = pending.pop();
		if (!current) break;
		const { node, path } = current;
		if (
			++count > 10000 ||
			path.length > 64 ||
			!node ||
			typeof node !== "object"
		)
			return { kind: "unsupported" };
		if (node.type === "text" && typeof node.text === "string")
			segments.push({ path, text: node.text });
		if (node.content !== undefined) {
			if (!Array.isArray(node.content)) return { kind: "unsupported" };
			for (let i = node.content.length - 1; i >= 0; i--)
				pending.push({ node: node.content[i], path: [...path, i] });
		}
	}
	return { kind: "document", document, segments };
}

export function changeOriginalText(
	value: string,
	path: readonly number[],
	text: string,
): string {
	const parsed = readOriginalText(value);
	if (parsed.kind !== "document")
		throw new Error("The original document cannot be edited as text segments.");
	let node = parsed.document;
	for (const index of path) {
		if (!Number.isSafeInteger(index) || index < 0 || !node.content?.[index])
			throw new Error("This text segment is no longer available.");
		node = node.content[index];
	}
	if (node.type !== "text" || typeof node.text !== "string")
		throw new Error("This is not a text segment.");
	if (node.text === text) return value;
	node.text = text;
	return JSON.stringify(parsed.document);
}
