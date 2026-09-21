import { expect, test } from "bun:test";
import {
	changeOriginalText,
	readOriginalText,
	usesOriginalTextEditor,
} from "./original-text";

test("original text retains its editor and explicit block/structured formats keep theirs", () => {
	expect(usesOriginalTextEditor({ contentMode: "article" })).toBe(true);
	expect(usesOriginalTextEditor({})).toBe(true);
	expect(usesOriginalTextEditor({ contentMode: "blocks" })).toBe(true);
	expect(
		usesOriginalTextEditor({
			contentMode: "blocks",
			blocks: [{ name: "core/paragraph" }],
		}),
	).toBe(false);
	expect(usesOriginalTextEditor({ blocksVersion: 2 })).toBe(false);
	expect(usesOriginalTextEditor({ blocks: [{ name: "core/paragraph" }] })).toBe(
		false,
	);
	expect(usesOriginalTextEditor({ contentMode: "article", hero: {} })).toBe(
		false,
	);
});
test("text edits preserve nested lists, marks, media, breaks and unknown metadata", () => {
	const doc = {
		type: "doc",
		attrs: { retained: true },
		content: [
			{
				type: "bulletList",
				content: [
					{
						type: "listItem",
						attrs: { checked: true },
						content: [
							{
								type: "paragraph",
								content: [
									{
										type: "text",
										text: "Original",
										marks: [
											{
												type: "link",
												attrs: { href: "/guide", target: "_blank" },
											},
											{ type: "underline" },
										],
									},
									{ type: "hardBreak" },
									{ type: "text", text: "Kept" },
								],
							},
						],
					},
				],
			},
			{
				type: "image",
				attrs: { src: "/asset.png", alt: "Original image", width: 400 },
			},
			{
				type: "custom",
				attrs: { retained: { answer: 42 } },
				content: [{ type: "text", text: "Unfamiliar node text" }],
			},
		],
	};
	const source = JSON.stringify(doc, null, 2),
		parsed = readOriginalText(source);
	expect(parsed.kind).toBe("document");
	if (parsed.kind !== "document") throw Error();
	expect(parsed.segments.map((x) => x.text)).toEqual([
		"Original",
		"Kept",
		"Unfamiliar node text",
	]);
	expect(changeOriginalText(source, parsed.segments[0].path, "Original")).toBe(
		source,
	);
	const changed = JSON.parse(
		changeOriginalText(source, parsed.segments[0].path, "Edited"),
	);
	const expected = JSON.parse(source.replace('"Original"', '"Edited"'));
	expect(changed).toEqual(expected);
	expect(JSON.parse(source)).toEqual(doc);
	expect(() => changeOriginalText(source, [1], "Wrong node")).toThrow();
	expect(() => changeOriginalText(source, [-1], "Wrong path")).toThrow();
});
test("plain content stays plain and malformed documents are never silently flattened", () => {
	for (const text of ["123", "true", "null", '"A quoted sentence"', ""]) {
		expect(readOriginalText(text)).toEqual({ kind: "plain", text });
	}
	expect(readOriginalText("Some original text")).toEqual({
		kind: "plain",
		text: "Some original text",
	});
	expect(readOriginalText('{"type":"doc",broken')).toEqual({
		kind: "unsupported",
	});
	expect(readOriginalText('{"type":"doc","content":{}}')).toEqual({
		kind: "unsupported",
	});
	expect(readOriginalText('{"type":"unknown","content":[]}')).toEqual({
		kind: "unsupported",
	});
});
