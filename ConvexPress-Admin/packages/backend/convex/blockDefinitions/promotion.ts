import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { prepareBlockPromotion } from "../canonicalDocuments/foundation/blockPromotion";
import { installedPromotions } from "../canonicalDocuments/foundation/generated/promotions";
import { checkGeneration, fail, owned, readVersion, readVersionApproval } from "./model";

const reviewed = {
  id: v.id("blockDefinitions"), version: v.number(), expectedGeneration: v.number(),
  expectedDigest: v.string(), targetName: v.string(),
};

/** Export is read-only. The package has no user, site, deployment or credential
 * identity. Installation and retiring future runtime placements are separate. */
export const exportPackage = query({
  args: reviewed,
  returns: v.object({ packageJson: v.string(), packageDigest: v.string(), targetName: v.string(), generation: v.number(), version: v.number(), digest: v.string() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger();
    const actor = await requireCan(ctx, "blocks.promote", budget);
    await requireCan(ctx, "blocks.compose", budget);
    await requireCan(ctx, "post.read", budget);
    const head = await owned(ctx, args.id, actor._id, budget);
    checkGeneration(head, args.expectedGeneration);
    if (head.status === "promoted") return fail("DEFINITION_PROMOTED", "This definition was already promoted to the Library.");
    const { row } = await readVersion(ctx, head, args.version, budget);
    if (row.digest !== args.expectedDigest) return fail("DEFINITION_REVIEW_CHANGED", "Review the exact definition version before exporting.");
    const promotion = prepareBlockPromotion(row.definitionJson, row.digest, args.targetName);
    return { packageJson: promotion.json, packageDigest: promotion.bundle.packageDigest, targetName: args.targetName,
      generation: head.generation, version: row.version, digest: row.digest };
  },
});

/** Readback never replays the confirmation mutation. It checks the same exact
 * operation identity, even if an approval changed after a successful promotion. */
export const inspect = query({
  args: { ...reviewed, expectedPackageDigest: v.string() },
  returns: v.object({ state: v.union(v.literal("ready"), v.literal("not-installed"), v.literal("needs-approval"), v.literal("promoted"), v.literal("conflict")), generation: v.number(), targetName: v.string() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger();
    const actor = await requireCan(ctx, "blocks.promote", budget);
    await requireCan(ctx, "blocks.compose", budget);
    await requireCan(ctx, "post.read", budget);
    const head = await owned(ctx, args.id, actor._id, budget);
    const result = (state: "ready" | "not-installed" | "needs-approval" | "promoted" | "conflict") => ({ state, generation: head.generation, targetName: args.targetName });
    if (head.status === "promoted") return result(head.promotedTo === args.targetName && head.promotedVersion === args.version && head.promotedDigest === args.expectedDigest && head.promotionPackageDigest === args.expectedPackageDigest && head.promotionSourceGeneration === args.expectedGeneration ? "promoted" : "conflict");
    if (!Number.isSafeInteger(args.expectedGeneration) || head.generation !== args.expectedGeneration) return result("conflict");
    const { row } = await readVersion(ctx, head, args.version, budget);
    if (row.digest !== args.expectedDigest) return result("conflict");
    const promotion = prepareBlockPromotion(row.definitionJson, row.digest, args.targetName);
    if (promotion.bundle.packageDigest !== args.expectedPackageDigest) return result("conflict");
    if ((await readVersionApproval(ctx, row, budget))?.status !== "active") return result("needs-approval");
    const installed = installedPromotions[args.targetName];
    return result(installed && installed.sourceName === head.name && installed.sourceVersion === row.version && installed.sourceDigest === row.digest && installed.packageDigest === promotion.bundle.packageDigest && installed.specDigest === promotion.specDigest ? "ready" : "not-installed");
  },
});

/** A caller-supplied name or hash is not installation evidence. Only generated
 * provenance from this deployed backend can authorize retiring the runtime head.
 * Versions and approvals stay intact for pinned pages and historical revisions. */
export const confirm = mutation({
  args: { ...reviewed, expectedPackageDigest: v.string() },
  returns: v.object({ id: v.id("blockDefinitions"), targetName: v.string(), version: v.number(), digest: v.string(), generation: v.number(), changed: v.boolean() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger();
    const actor = await requireCan(ctx, "blocks.promote", budget);
    await requireCan(ctx, "blocks.compose", budget);
    await requireCan(ctx, "post.read", budget);
    await requireCan(ctx, "post.update", budget);
    await requireCan(ctx, "post.publish", budget);
    const head = await owned(ctx, args.id, actor._id, budget);
    if (head.status === "promoted") {
      if (head.promotedTo !== args.targetName || head.promotedVersion !== args.version || head.promotedDigest !== args.expectedDigest || head.promotionPackageDigest !== args.expectedPackageDigest || head.promotionSourceGeneration !== args.expectedGeneration)
        return fail("DEFINITION_PROMOTED", "This definition was promoted by a different reviewed operation.");
      return { id: head._id, targetName: args.targetName, version: args.version, digest: args.expectedDigest, generation: head.generation, changed: false };
    }
    checkGeneration(head, args.expectedGeneration);
    const { row } = await readVersion(ctx, head, args.version, budget);
    if (row.digest !== args.expectedDigest) return fail("DEFINITION_REVIEW_CHANGED", "Review the exact definition version before promoting.");
    if ((await readVersionApproval(ctx, row, budget))?.status !== "active") return fail("DEFINITION_NOT_APPROVED", "Approve the reviewed version before promoting it to the Library.");
    const promotion = prepareBlockPromotion(row.definitionJson, row.digest, args.targetName);
    if (promotion.bundle.packageDigest !== args.expectedPackageDigest) return fail("PROMOTION_REVIEW_CHANGED", "The exported promotion package has changed.");
    const installed = installedPromotions[args.targetName];
    if (!installed || installed.sourceName !== head.name || installed.sourceVersion !== row.version || installed.sourceDigest !== row.digest || installed.packageDigest !== promotion.bundle.packageDigest || installed.specDigest !== promotion.specDigest)
      return fail("PROMOTION_NOT_INSTALLED", "Install and deploy this exact reviewed Library block before confirming promotion.");
    const generation = head.generation + 1;
    await ctx.db.patch("blockDefinitions", head._id, { status: "promoted", promotedTo: args.targetName,
      promotedVersion: row.version, promotedDigest: row.digest, promotionPackageDigest: promotion.bundle.packageDigest,
      promotionSourceGeneration: head.generation, generation, updatedBy: actor._id, updatedAt: Date.now() });
    return { id: head._id, targetName: args.targetName, version: row.version, digest: row.digest, generation, changed: true };
  },
});
