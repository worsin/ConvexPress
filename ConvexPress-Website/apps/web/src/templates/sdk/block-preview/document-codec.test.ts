import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	canonicalPreviewCodec,
	bindingForInstallation,
} from "./document-codec";
import { canonicalContentDigest } from "../block-data/portable/documentContracts";
import {
	PACKAGED_PREVIEW_PARENT_ORIGIN,
	validPreviewParentOrigin,
} from "./channel";
const scope = { websiteKey: "site", instanceKey: "staging" },
	viewerGeneration = "native_generation_0001";
const document = {
	contract: "canonical-document-v1",
	scope,
	document: {
		id: "draft",
		type: "page",
		title: "Saved",
		status: "draft",
		path: "/draft",
		blocksVersion: 2,
		revision: 1,
		digest: canonicalContentDigest("Saved", []),
		blocks: [],
	},
	presentation: { packId: "core", revision: "a".repeat(64) },
	policy: { enabledPlugins: [], capabilities: [], disabledBlocks: [] },
	data: { contract: "canonical-data-v1", scope, dataByBlock: {} },
	resources: { media: {} },
};
test("display codec verifies the actual closed document, digest and server-owned scope without bearer fields", () => {
	const decoded = canonicalPreviewCodec.decode({ document, viewerGeneration });
	expect(canonicalPreviewCodec.binding(decoded)).toEqual({
		...scope,
		documentId: "draft",
		revision: 1,
		viewerGeneration,
	});
	for (const raw of [
		{ document, viewerGeneration, token: "forbidden" },
		{
			document: {
				...document,
				document: { ...document.document, title: "changed" },
			},
			viewerGeneration,
		},
		{ document, viewerGeneration: "" },
		{ document: null, viewerGeneration },
	])
		expect(() => canonicalPreviewCodec.decode(raw)).toThrow();
	const binding = canonicalPreviewCodec.binding(decoded);
	expect(bindingForInstallation(binding, "staging")).toEqual(binding);
	expect(bindingForInstallation(binding, "production")).toBeNull();
	expect(
		bindingForInstallation({ ...binding, extra: true }, "staging"),
	).toBeNull();
});
test("packaged parent matches the actual native protocol constants and rejects opaque or alternative schemes", () => {
	const source = readFileSync(
		new URL(
			"../../../../../../../ConvexPress-Admin/packages/desktop/electron/rendererProtocol.ts",
			import.meta.url,
		),
		"utf8",
	);
	const scheme = source.match(/PACKAGED_RENDERER_SCHEME = "([^"]+)"/)?.[1],
		host = source.match(/PACKAGED_RENDERER_HOST = "([^"]+)"/)?.[1];
	expect(PACKAGED_PREVIEW_PARENT_ORIGIN).toBe(`${scheme}://${host}`);
	expect(validPreviewParentOrigin(PACKAGED_PREVIEW_PARENT_ORIGIN)).toBe(true);
	for (const origin of [
		"null",
		"file://",
		"convexpress-app://other",
		"convexpress-admin://app",
	])
		expect(validPreviewParentOrigin(origin)).toBe(false);
});

test("native preview conversion strips hidden authoring content and private metadata without mutating the editor", async () => {
  const { parseCanonicalDocumentRead, canonicalPreviewDocument, canonicalDisplayDigest } = await import("../block-data/portable/documentContracts");
  const { validateCanonicalTree } = await import("../block-data/portable/generated/instances");
  const authored = validateCanonicalTree([
    { id: "visible", name: "core/paragraph", version: 2, attrs: {}, lock: { edit: false } },
    { id: "private", name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "PRIVATE_AUTHORED_COPY" }] }] } } },
  ]);
  const { lock: _lock, ...visible } = authored[0]!;
  const raw = { ...document, document: { ...document.document, blocks: authored, digest: canonicalContentDigest("Saved", authored) }, displayBlocks: [visible], displayLease: { evaluatedAt: 10, expiresAt: 1000 } };
  const read = parseCanonicalDocumentRead(raw); if (!read || read.contract !== "canonical-document-v1") throw Error("Invalid fixture");
  expect(() => canonicalPreviewCodec.decode({ document: read, viewerGeneration })).toThrow();
  const preview = canonicalPreviewDocument(read), decoded = canonicalPreviewCodec.decode({ document: preview, viewerGeneration });
  expect(decoded.document.document.blocks.map(row => row.id)).toEqual(["visible"]);
  expect(JSON.stringify(preview)).not.toContain("PRIVATE_AUTHORED_COPY");expect(JSON.stringify(preview)).not.toContain('"lock"');
  expect(preview.document.digest).not.toBe(read.document.digest);expect(read.document.blocks).toHaveLength(2);expect(read.document.blocks[0]!.lock).toEqual({ edit: false });
  expect(preview.displayLease).toEqual(read.displayLease);expect(preview.displayBlocks).toBeUndefined();
  expect(canonicalDisplayDigest({ ...read, displayBlocks: [] })).not.toBe(canonicalDisplayDigest(read));
  expect(canonicalDisplayDigest({ ...read, displayLease: { evaluatedAt: 20, expiresAt: 1010 } })).toBe(canonicalDisplayDigest(read));
  const { displayBlocks: _display, ...unredacted } = raw;
  expect(() => canonicalPreviewCodec.decode({ document: unredacted, viewerGeneration })).toThrow();
});

test("display roots cannot inject, reorder, reparent or modify authored blocks and public DTOs refuse authoring projections", async () => {
  const { parseCanonicalDocumentRead } = await import("../block-data/portable/documentContracts");
  const { parsePublicCanonicalDocument } = await import("../block-data/portable/publicDocumentContracts");
  const { validateCanonicalTree } = await import("../block-data/portable/generated/instances");
  const authored = validateCanonicalTree([
    { id: "group", name: "core/group", version: 1, attrs: {}, children: [{ id: "inside", name: "core/paragraph", version: 2, attrs: {} }] },
    { id: "outside", name: "core/paragraph", version: 2, attrs: {} },
  ]);
  const raw = { ...document, policy: { ...document.policy, capabilities: ["tree.children"] }, document: { ...document.document, blocks: authored, digest: canonicalContentDigest("Saved", authored) }, displayLease: { evaluatedAt: 1, expiresAt: 1000 } };
  for (const displayBlocks of [
    [{ ...authored[1]!, id: "invented" }], [...authored].reverse(), [authored[0]!.children![0]],
    [{ ...authored[0]!, children: [authored[1]!] }], [{ ...authored[1]!, anchor: "changed" }],
  ]) expect(() => parseCanonicalDocumentRead({ ...raw, displayBlocks })).toThrow();
  expect(() => parseCanonicalDocumentRead({ ...raw, displayBlocks: [], displayLease: undefined })).toThrow();
  for (const displayLease of [{ evaluatedAt: 1, expiresAt: 1 }, { evaluatedAt: 1, expiresAt: 60002 }]) expect(() => parseCanonicalDocumentRead({ ...raw, displayLease })).toThrow();
  expect(parseCanonicalDocumentRead({ ...raw, displayBlocks: [{ ...authored[0]!, children: [] }] })?.contract).toBe("canonical-document-v1");
  const { status: _status, ...publicDoc } = raw.document;
  expect(() => parsePublicCanonicalDocument({ ...raw, contract: "canonical-public-document-v1", state: "ready", document: publicDoc, viewerSubject: null, accessLease: null, displayBlocks: [] })).toThrow();
});
