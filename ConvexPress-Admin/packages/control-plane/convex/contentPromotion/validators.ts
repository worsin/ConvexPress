import { v, type Infer } from "convex/values";
import { promotionDataSchemas, type PromotionKind } from "@convexpress/site-contract/content-promotion";

const nullableString = v.union(v.string(), v.null());
const environmentKind = v.union(v.literal("live"), v.literal("staging"), v.literal("beta"), v.literal("preview"), v.literal("development"), v.literal("local"), v.literal("custom"));
export const identityValidator = v.object({ websiteKey: v.string(), instanceKey: v.string(), deploymentOrigin: v.string(), siteOrigin: v.string(), environmentKind, schemaVersion: v.string() });
export const targetValidator = v.object({ connectionId: v.id("overseer_connections"), instanceId: v.id("overseer_websiteInstances"), websiteId: v.id("overseer_websites"), identity: identityValidator, authorityHash: v.string() });
export const beginResultValidator = v.object({ receiptId: v.id("overseer_contentPromotionReviews"), execute: v.boolean(), source: targetValidator, target: targetValidator });
export const authoredKind = v.union(...(Object.keys(promotionDataSchemas) as PromotionKind[]).map(kind => v.literal(kind)), v.literal('syncedBlock'));
export const mappingValidator = v.object({ key: v.string(), kind: authoredKind, targetId: v.string() });
export const applyStatusValidator = v.union(v.literal("checking"), v.literal("submitting"), v.literal("uncertain"), v.literal("applied"), v.literal("rejected"), v.literal("rolled-back"));
export const applySummaryValidator = v.object({ applyId: v.id("overseer_contentPromotionApplies"), receiptId: v.id("overseer_contentPromotionReviews"), reviewFingerprint: v.string(), status: applyStatusValidator, canApply: v.literal(false), recoveryNeeded: v.boolean(), attempt: v.number(), dispatchCount: v.number(), sourceCheckedAt: v.union(v.number(), v.null()), dispatchedAt: v.union(v.number(), v.null()), retryAfter: v.union(v.number(), v.null()), failureCode: v.union(v.string(), v.null()), mappings: v.union(v.array(mappingValidator), v.null()), createdAt: v.number(), updatedAt: v.number(), finishedAt: v.union(v.number(), v.null()) });
export type ApplySummary = Infer<typeof applySummaryValidator>;

/** Nested authored data is validated against its kind schema before serialization, not accepted as arbitrary Convex values. */
export const reviewResultValidator = v.object({
  sourceIdentity: identityValidator, targetIdentity: identityValidator,
  receiptId: v.id("overseer_contentPromotionReviews"),
  sourceConnectionId: v.id("overseer_connections"), targetConnectionId: v.id("overseer_connections"),
  status: v.union(v.literal("reviewing"), v.literal("reviewed"), v.literal("blocked"), v.literal("failed"), v.literal("expired"), v.literal("conflict")),
  canApply: v.boolean(), canRecover: v.boolean(), applyState: v.union(applySummaryValidator, v.null()), reviewReady: v.boolean(), mediaReady: v.boolean(),
  reviewFingerprint: v.string(), requestHash: v.string(), authorityHash: v.string(), manifestHash: nullableString, sourceRevisionHash: nullableString,
  recordCount: v.number(), mediaRequired: v.number(), mediaProvided: v.number(),
  authoredRecords: v.array(v.object({ key: v.string(), kind: authoredKind, sourceRevision: v.string(), dataJson: v.string() })),
  issues: v.array(v.object({ code: v.string(), key: v.string(), path: v.string(), message: v.string() })),
  changes: v.array(v.object({ key: v.string(), kind: authoredKind, targetId: nullableString, beforeRevision: v.string(), fields: v.array(v.string()) })),
  failureCode: nullableString, createdAt: v.number(), expiresAt: v.number(),
});
export type PublicReview = Infer<typeof reviewResultValidator>;
