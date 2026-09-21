import { assertPublicCanonicalTree } from "../block-data/portable/publicTree";
import { z } from "zod";
import {
	parseCanonicalDocumentRead,
	canonicalDisplayDigest,
	type CanonicalDocumentDto,
} from "../block-data/portable/documentContracts";
import type { PreviewCodec, PreviewBinding } from "./channel";
const generation = z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/u);
export const previewBindingSchema = z.strictObject({
	websiteKey: z.string().min(1).max(128),
	instanceKey: z.string().min(1).max(128),
	documentId: z.string().min(1).max(256),
	revision: z.number().int().nonnegative(),
	viewerGeneration: generation,
});
export interface CanonicalDisplay {
	document: CanonicalDocumentDto;
	viewerGeneration: string;
}
const envelope = z.strictObject({
	document: z.unknown(),
	viewerGeneration: generation,
});
export const canonicalPreviewCodec: PreviewCodec<CanonicalDisplay> = {
	decode(raw) {
		const value = envelope.parse(raw),
			document = parseCanonicalDocumentRead(value.document);
		if (!document || document.contract !== "canonical-document-v1")
			throw new Error("A current saved canonical document is required.");
		if (document.displayBlocks !== undefined) throw new Error("Authoring projections cannot cross the preview channel.");
    assertPublicCanonicalTree(document.document.blocks);
		return { document, viewerGeneration: value.viewerGeneration };
	},
	binding: ({ document, viewerGeneration }) => ({
		...document.scope,
		documentId: document.document.id,
		revision: document.document.revision,
		viewerGeneration,
	}),
	digest: ({ document }) => canonicalDisplayDigest(document),
};
/** Configured host identifies this display channel; it grants no backend access. */
export function bindingForInstallation(
	input: unknown,
	instanceKey: string,
): PreviewBinding | null {
	const parsed = previewBindingSchema.safeParse(input);
	return parsed.success &&
		!!instanceKey &&
		parsed.data.instanceKey === instanceKey
		? parsed.data
		: null;
}
