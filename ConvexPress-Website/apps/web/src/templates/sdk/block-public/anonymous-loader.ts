import { blockPageRequestSchema, type BlockPageRequest } from "../block-data/portable/postGridContracts";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { getSiteRuntime } from "@/lib/site-runtime";

/** Route loaders use a separate never-authenticated HTTP client. No member or
 * password response enters loader serialization or the shared SSR query cache. */
export async function loadAnonymousCanonical(
	document: { _id?: string; blocksVersion?: number } | null | undefined,
 request: BlockPageRequest = {},
) {
	if (!document?._id || document.blocksVersion !== 2) return null;
	// The full block contract graph is needed only for a canonical document.
	const { parsePublicCanonicalDocument } = await import("../block-data/portable/publicDocumentContracts");
	const client = new ConvexHttpClient(getSiteRuntime().convexUrl);
	const result = parsePublicCanonicalDocument(
		await client.query(api.canonicalDocuments.getForRender, {
			postId: document._id as Id<"posts">,
 request: blockPageRequestSchema.parse(request),
		}),
	);
	if (result && result.viewerSubject !== null)
		throw new Error(
			"An anonymous document read returned a viewer-specific result.",
		);
	return result;
}
