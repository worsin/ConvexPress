import { v } from "convex/values";
import { internalMutation, query, type QueryCtx, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { contentPromotionManifestSchema, promotionReviewedRecords } from "@convexpress/site-contract/content-promotion";
import { preparePair } from "./records";
import { hash } from "./policy";
import { APPLY_CODES, APPLY_LEASE_MS, ATOMIC_SITE_REFUSALS, ApplyGuardError, applySummary, applySummaryValidator, claimValidator, evidenceSchema, reviewedEnvelope, terminal } from "./applyPolicy";

type Context = QueryCtx | MutationCtx;
async function authorize(ctx: Context, receiptId: Id<"overseer_contentPromotionReviews">) {
  const receipt = await ctx.db.get(receiptId);
  if (!receipt) throw new Error("Reviewed receipt not found");
  const pair = await preparePair(ctx, receipt.sourceConnectionId, receipt.targetConnectionId);
  if (pair.operatorId !== receipt.operatorId || pair.source.websiteId !== receipt.websiteId || pair.source.instanceId !== receipt.sourceInstanceId || pair.target.instanceId !== receipt.targetInstanceId) throw new Error("Reviewed receipt not found");
  const envelope = reviewedEnvelope(receipt);
  if (hash(pair.source.identity) !== hash(envelope.manifest.source) || hash(pair.target.identity) !== hash(envelope.manifest.target)) throw new ApplyGuardError("AUTHORITY_CHANGED");
  return { receipt, pair, envelope };
}
function fresh(value: Awaited<ReturnType<typeof authorize>>) {
  if (value.receipt.expiresAt <= Date.now()) throw new ApplyGuardError("REVIEW_EXPIRED");
  if (value.pair.authorityHash !== value.receipt.authorityHash) throw new ApplyGuardError("AUTHORITY_CHANGED");
}
export const claim = internalMutation({
  args: { receiptId: v.id("overseer_contentPromotionReviews"), expectedReviewFingerprint: v.string(), confirmLive: v.literal(true), leaseId: v.string() },
  returns: claimValidator,
  handler: async (ctx, args) => {
    if (args.confirmLive !== true || !/^[a-zA-Z0-9_-]{8,100}$/.test(args.leaseId)) throw new Error("Explicit reviewed confirmation is required");
    const value = await authorize(ctx, args.receiptId);
    if (args.expectedReviewFingerprint !== value.envelope.fingerprint) throw new Error("Reviewed fingerprint differs; review the current receipt");
    const existing = await ctx.db.query("overseer_contentPromotionApplies").withIndex("by_receipt", q => q.eq("receiptId", args.receiptId)).unique();
    if (existing && (existing.operatorId !== value.pair.operatorId || existing.reviewFingerprint !== value.envelope.fingerprint)) throw new Error("Apply identity differs from the reviewed receipt");
    const now = Date.now();
    if (existing && (terminal(existing.status) || existing.leaseExpiresAt > now)) return { applyId: existing._id, work: null };
    // A prior dispatch may have committed even after our review expires. Permit status recovery, never a new dispatch, in that case.
    if (!existing?.dispatchCount) fresh(value);
    const fields = { status: existing?.dispatchCount ? "uncertain" as const : "checking" as const, leaseId: args.leaseId, leaseExpiresAt: now + APPLY_LEASE_MS, attempt: (existing?.attempt ?? 0) + 1, updatedAt: now };
    const applyId = existing ? existing._id : await ctx.db.insert("overseer_contentPromotionApplies", { ...fields, receiptId: args.receiptId, operatorId: value.pair.operatorId, reviewFingerprint: value.envelope.fingerprint, dispatchCount: 0, createdAt: now });
    if (existing) await ctx.db.patch(existing._id, fields);
    return { applyId, work: { source: value.pair.source, target: value.pair.target, manifestJson: value.receipt.manifestJson!, requestJson: value.receipt.requestJson, siteReceiptId: value.receipt.siteReceiptId!, siteDigest: value.receipt.siteDigest!, reviewExpiresAt: value.receipt.expiresAt, authorityCurrent: value.pair.authorityHash === value.receipt.authorityHash, wasDispatched: !!existing?.dispatchCount } };
  },
});
export const dispatch = internalMutation({
  args: { applyId: v.id("overseer_contentPromotionApplies"), leaseId: v.string(), sourceManifestJson: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.applyId);
    if (!row || row.leaseId !== args.leaseId || row.leaseExpiresAt <= Date.now() || terminal(row.status)) throw new Error("Apply lease is no longer current");
    const value = await authorize(ctx, row.receiptId); fresh(value);
    if (row.reviewFingerprint !== value.envelope.fingerprint) throw new ApplyGuardError("AUTHORITY_CHANGED");
    if (new TextEncoder().encode(args.sourceManifestJson).length > 500_000) throw new ApplyGuardError("SOURCE_CHANGED");
    const manifest = contentPromotionManifestSchema.parse(JSON.parse(args.sourceManifestJson));
    if (hash(manifest) !== value.receipt.manifestHash || hash(manifest.records.map(record => [record.key, record.sourceRevision])) !== value.receipt.sourceRevisionHash) throw new ApplyGuardError("SOURCE_CHANGED");
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "submitting", dispatchCount: row.dispatchCount + 1, dispatchedAt: row.dispatchedAt ?? now, sourceCheckedAt: now, updatedAt: now, failureCode: undefined });
    return null;
  },
});
export const finish = internalMutation({
  args: { applyId: v.id("overseer_contentPromotionApplies"), leaseId: v.string(), outcome: v.union(v.literal("applied"), v.literal("rejected"), v.literal("uncertain"), v.literal("rolled-back")), failureCode: v.optional(v.string()), evidenceJson: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.applyId);
    if (!row || row.leaseId !== args.leaseId) throw new Error("Apply lease is no longer current");
    const value = await authorize(ctx, row.receiptId);
    if (terminal(row.status)) return null;
    if (row.reviewFingerprint !== value.envelope.fingerprint) throw new ApplyGuardError("AUTHORITY_CHANGED");
    if (args.evidenceJson && new TextEncoder().encode(args.evidenceJson).length > 100_000) throw new Error("Apply evidence exceeds its bound");
    const evidence = args.evidenceJson ? evidenceSchema.parse(JSON.parse(args.evidenceJson)) : null;
    let mappingsJson: string | undefined;
    if (args.outcome === "applied" || args.outcome === "rolled-back") {
      if (!evidence || evidence.kind === "rejection" || evidence.result.receiptId !== value.receipt.siteReceiptId || evidence.result.digest !== value.receipt.siteDigest || evidence.result.status !== args.outcome) throw new Error("Target outcome evidence is inconsistent");
      if (evidence.kind === "status") {
        if (evidence.result.targetInstanceKey !== value.pair.target.identity.instanceKey) throw new Error("Target outcome identity is inconsistent");
      } else {
        const records = promotionReviewedRecords(value.envelope.manifest);
        if (evidence.result.mappings.length !== records.length || new Set(evidence.result.mappings.map(mapping => mapping.key)).size !== records.length || evidence.result.mappings.some(mapping => records.find(record => record.key === mapping.key)?.kind !== mapping.kind)) throw new Error("Target mappings differ from reviewed records");
        mappingsJson = JSON.stringify(evidence.result.mappings);
      }
    }
    // A durable target fence is also authoritative after any number of uncertain
    // dispatches. A mere ready/expired query is deliberately not sufficient.
    const retired = evidence?.kind === "status" && evidence.result.status === "retired"
      && evidence.result.receiptId === value.receipt.siteReceiptId && evidence.result.digest === value.receipt.siteDigest
      && evidence.result.targetInstanceKey === value.pair.target.identity.instanceKey
      && evidence.result.expiresAt <= Date.now() && args.failureCode === "REVIEW_EXPIRED";
    const firstAtomicRefusal = row.dispatchCount === 1 && evidence?.kind === "rejection" && ATOMIC_SITE_REFUSALS.has(evidence.code);
    if (args.outcome === "rejected" && row.dispatchCount > 0 && !firstAtomicRefusal && !retired) throw new Error("A prior dispatch requires outcome recovery");
    const now = Date.now();
    await ctx.db.patch(row._id, { status: args.outcome, leaseExpiresAt: now, updatedAt: now, finishedAt: args.outcome === "uncertain" ? undefined : now, failureCode: args.outcome === "applied" ? undefined : APPLY_CODES.has(args.failureCode ?? "") ? args.failureCode : "APPLY_TRANSPORT_UNCERTAIN", ...(mappingsJson ? { mappingsJson } : {}) });
    return null;
  },
});
export const get = query({
  args: { receiptId: v.id("overseer_contentPromotionReviews") }, returns: v.union(v.null(), applySummaryValidator),
  handler: async (ctx, args) => {
    const value = await authorize(ctx, args.receiptId);
    const row = await ctx.db.query("overseer_contentPromotionApplies").withIndex("by_receipt", q => q.eq("receiptId", args.receiptId)).unique();
    if (!row) return null;
    if (row.operatorId !== value.pair.operatorId || row.reviewFingerprint !== value.envelope.fingerprint) throw new Error("Apply identity differs from reviewed receipt");
    return applySummary(row);
  },
});
