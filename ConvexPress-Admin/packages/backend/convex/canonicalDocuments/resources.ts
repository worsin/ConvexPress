import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import type { RuntimeCanonicalTree } from "./foundation/composedRegistry";
import type { ComposedDataContext } from "./foundation/planner";
import type { CanonicalDocumentDto } from "./foundation/documentContracts";
import { collectCanonicalDisplayMediaIds } from "./foundation/documentContracts";
import { renderMediaSchema } from "./foundation/renderResources";
function refuse(code: string, message: string): never { throw new ConvexError({ code, message }); }

export async function readCanonicalResources(
	ctx: QueryCtx,
	blocks: RuntimeCanonicalTree,
	budget: RequestReadLedger,
  composed?: ComposedDataContext,
): Promise<CanonicalDocumentDto["resources"]> {
	const media: CanonicalDocumentDto["resources"]["media"] = {};
	for (const value of collectCanonicalDisplayMediaIds(blocks, composed)) {
		const id = ctx.db.normalizeId("media", value);
		if (!id)
			refuse("MEDIA_UNAVAILABLE", "A selected media reference is invalid.");
		budget.beforeRead();
		const doc = budget.record(await ctx.db.get("media", id));
		if (!doc || (doc.status !== "active" && doc.status !== "processing"))
			refuse("MEDIA_UNAVAILABLE", "A selected media item is unavailable.");
		let src = doc.url;
		if (doc.storageId) {
			budget.beforeRead();
			const current = await ctx.storage.getUrl(doc.storageId);
			if (!current)
				refuse("MEDIA_UNAVAILABLE", "A selected media file is missing.");
			src = current;
		}
		media[value] = renderMediaSchema.parse({
			src,
			alt: doc.altText ?? "",
			...(doc.width === undefined ? {} : { width: doc.width }),
			...(doc.height === undefined ? {} : { height: doc.height }),
			mimeType: doc.mimeType,
			filename: doc.fileName,
			byteSize: doc.fileSize,
		});
	}
	return { media };
}
