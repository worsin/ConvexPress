import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { checkGeneration, fail, owned, readVersion } from "./model";

/** Exact schema approval is
 * separate from both definition drafts and page publication. No system actor
 * may manufacture this interactive authorization. */
export const setVersionState = mutation({
  args: { id: v.id("blockDefinitions"), version: v.number(), expectedGeneration: v.number(), expectedDigest: v.string(), enabled: v.boolean() },
  returns: v.object({ id: v.id("blockDefinitions"), version: v.number(), digest: v.string(), generation: v.number(), activeVersion: v.union(v.number(), v.null()), status: v.union(v.literal("active"), v.literal("revoked")), changed: v.boolean() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger();
    await requireCan(ctx, "blocks.compose", budget);
    const actor = await requireCan(ctx, "post.publish", budget);
    await requireCan(ctx, "post.update", budget);
    const head = await owned(ctx, args.id, actor._id, budget);
    checkGeneration(head, args.expectedGeneration);
    if (args.enabled && head.status === "promoted") return fail("DEFINITION_PROMOTED", "Review the promoted Library block instead of activating its retired runtime definition.");
    const { row } = await readVersion(ctx, head, args.version, budget);
    if (row.digest !== args.expectedDigest) return fail("DEFINITION_REVIEW_CHANGED", "Review this exact definition version before changing its approval.");
    budget.beforeRead();
    const previous = budget.record(await ctx.db.query("blockDefinitionApprovals").withIndex("by_definition_version", q => q.eq("definitionId", head._id).eq("version", args.version)).unique());
    if (previous && previous.digest !== row.digest) return fail("DEFINITION_INTEGRITY", "The approval does not match its immutable definition version.");
    const status = args.enabled ? "active" as const : "revoked" as const;
    const changed = previous?.status !== status;
    if (!changed) return { id: head._id, version: args.version, digest: row.digest, generation: head.generation, activeVersion: head.activeVersion ?? null, status, changed: false };
    const now = Date.now(), value = { definitionId: head._id, version: args.version, digest: row.digest, status, updatedBy: actor._id, updatedAt: now };
    if (previous) await ctx.db.patch("blockDefinitionApprovals", previous._id, value);
    else await ctx.db.insert("blockDefinitionApprovals", value);
    // Choose a currently approved version for future placements. This never
    // rewrites the pinned version on any existing page or historical revision.
    let activeVersion = args.enabled ? args.version : head.activeVersion;
    if (!args.enabled && head.activeVersion === args.version) {
      budget.beforeRead();
      const remaining = budget.record(await ctx.db.query("blockDefinitionApprovals").withIndex("by_definition_status_version", q => q.eq("definitionId", head._id).eq("status", "active")).order("desc").first());
      if (remaining) {
        const retained = await readVersion(ctx, head, remaining.version, budget);
        if (remaining.digest !== retained.row.digest) return fail("DEFINITION_INTEGRITY", "The remaining approval does not match its immutable version.");
      }
      activeVersion = remaining?.version;
    }
    const generation = head.generation + 1;
    await ctx.db.patch("blockDefinitions", head._id, { generation, activeVersion, status: head.status === "promoted" ? "promoted" : activeVersion === undefined ? "draft" : "active", updatedBy: actor._id, updatedAt: now });
    return { id: head._id, version: args.version, digest: row.digest, generation, activeVersion: activeVersion ?? null, status, changed: true };
  },
});
