import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { canonicalStoredTreeValidator } from "../canonicalDocuments/foundation/generated/storage";
import { displayContext } from "../canonicalDocuments/displayContext";
import { canonicalBoundary } from "../canonicalDocuments/service";
import { content, owned, storedRevision, syncedFailure } from "./model";

/** Authoring input, not a public render DTO. Dynamic resources are selected
 * separately through source-authorized bounded readers. */
export const get = query({
  args: { id: v.id("syncedBlocks") },
  returns: v.object({
    id: v.id("syncedBlocks"), title: v.string(), generation: v.number(), revision: v.number(),
    blocks: canonicalStoredTreeValidator, digest: v.string(),
    scope: v.object({ websiteKey: v.string(), instanceKey: v.string() }),
    policy: v.object({ enabledPlugins: v.array(v.string()), capabilities: v.array(v.string()), disabledBlocks: v.array(v.string()) }),
  }),
  handler: (ctx, args) => canonicalBoundary(async () => {
    const budget = new RequestReadLedger();
    const actor = await requireCan(ctx, "post.update", budget);
    const { source } = await owned(ctx, args.id, actor._id, budget);
    const version = await storedRevision(ctx, source._id, source.lastRevision, budget);
    if (!version) return syncedFailure("SYNCED_REVISION", "Recover the current revision before editing.");
    const value = content(version.title, version.blocks);
    if (value.digest !== version.digest) return syncedFailure("SYNCED_REVISION", "Recover the damaged revision before editing.");
    const { scope, policy } = await displayContext(ctx, budget);
    return { id: source._id, title: value.title, generation: source.generation, revision: version.revision, blocks: value.blocks, digest: value.digest, scope, policy };
  }),
});
