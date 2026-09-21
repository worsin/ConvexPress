import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@control/convex/_generated/api";
import { parseReviewedRecord, type Review } from "./promotionReviewModel";
export type ApplyResult = FunctionReturnType<typeof api.contentPromotion.apply.execute>;
export type ApplyArgs = FunctionArgs<typeof api.contentPromotion.apply.execute>;
export type ReviewScope = { operatorId: string; websiteId: string; websiteKey: string; sourceConnectionId: string; targetConnectionId: string; sourceInstanceKey: string; targetInstanceKey: string; sourceDeploymentOrigin: string; targetDeploymentOrigin: string; sourceSiteOrigin: string; targetSiteOrigin: string };
export type ApplyMode = "apply" | "recover";
export type Confirmation = { review: Review; scopeKey: string; mode: ApplyMode };
export function reviewScopeKey(scope: ReviewScope) { return JSON.stringify(scope); }
export function matchesReviewScope(review: Review, scope: ReviewScope) {
  return !!scope.operatorId && review.sourceIdentity.websiteKey === scope.websiteKey && review.targetIdentity.websiteKey === scope.websiteKey && review.sourceConnectionId === scope.sourceConnectionId && review.targetConnectionId === scope.targetConnectionId && scope.sourceConnectionId !== scope.targetConnectionId && review.sourceIdentity.instanceKey === scope.sourceInstanceKey && review.targetIdentity.instanceKey === scope.targetInstanceKey && review.sourceIdentity.deploymentOrigin === scope.sourceDeploymentOrigin && review.targetIdentity.deploymentOrigin === scope.targetDeploymentOrigin && review.sourceIdentity.siteOrigin === scope.sourceSiteOrigin && review.targetIdentity.siteOrigin === scope.targetSiteOrigin && review.sourceIdentity.environmentKind === "staging" && review.targetIdentity.environmentKind === "live";
}
/** Local checks only restrict a server eligibility decision; they never create one. */
export function availableApplyMode(review: Review, scope: ReviewScope, allowed: boolean, now = Date.now()): ApplyMode | null {
  if (!allowed || !matchesReviewScope(review, scope) || !/^[0-9a-f]{64}$/.test(review.reviewFingerprint) || review.authoredRecords.length !== review.recordCount || review.authoredRecords.some(record => !parseReviewedRecord(record))) return null;
  if (review.canApply === true && review.reviewReady === true && review.mediaReady === true && review.status === "reviewed" && !review.applyState && review.expiresAt > now && review.recordCount > 0 && review.issues.length === 0) return "apply";
  const state = review.applyState;
  if (review.canRecover === true && state && state.receiptId === review.receiptId && state.reviewFingerprint === review.reviewFingerprint && ["checking", "submitting", "uncertain"].includes(state.status) && (state.retryAfter === null || state.retryAfter <= now)) return "recover";
  return null;
}
export function prepareApplyConfirmation(review: Review, scope: ReviewScope, allowed: boolean, now = Date.now()): Confirmation | null {
  const mode = availableApplyMode(review, scope, allowed, now);
  return mode ? { review: structuredClone(review), scopeKey: reviewScopeKey(scope), mode } : null;
}
export function confirmationIsCurrent(confirmation: Confirmation, latest: Review, scope: ReviewScope, allowed: boolean, now = Date.now()) {
  return confirmation.scopeKey === reviewScopeKey(scope) && confirmation.review.receiptId === latest.receiptId && confirmation.review.reviewFingerprint === latest.reviewFingerprint && confirmation.mode === availableApplyMode(latest, scope, allowed, now);
}
function withResult(review: Review, result: ApplyResult): Review {
  if (result.receiptId !== review.receiptId || result.reviewFingerprint !== review.reviewFingerprint) throw new Error("Apply result identity changed");
  return { ...review, canApply: false, canRecover: false, reviewReady: false, applyState: result };
}
export class StaleConfirmationError extends Error { constructor() { super("This confirmation is no longer current. Refresh the receipt and review it again."); } }
type Context = { scope: ReviewScope; allowed: boolean; current: boolean; now?: number };
/** One explicit submission, then readback only. No automatic replay after a transport error. */
export async function submitReviewedConfirmation(confirmation: Confirmation, acknowledged: boolean, ports: {
  context(): Context;
  read(receiptId: Review["receiptId"]): Promise<Review>;
  execute(args: ApplyArgs): Promise<ApplyResult>;
  dispatched(): void;
}): Promise<{ review: Review; unknown: boolean; refreshFailed: boolean }> {
  const valid = (review: Review) => { const context = ports.context(); return context.current && confirmationIsCurrent(confirmation, review, context.scope, context.allowed, context.now); };
  if (!acknowledged || !valid(confirmation.review)) throw new StaleConfirmationError();
  const fresh = await ports.read(confirmation.review.receiptId);
  if (!valid(fresh)) throw new StaleConfirmationError();
  ports.dispatched();
  let returned: ApplyResult | null = null;
  try { returned = await ports.execute({ receiptId: fresh.receiptId, expectedReviewFingerprint: fresh.reviewFingerprint, confirmLive: true }); } catch { /* The durable controller receipt, not this transport error, determines the outcome. */ }
  if (!ports.context().current || !ports.context().allowed) throw new StaleConfirmationError();
  let known: Review;
  try { known = returned ? withResult(fresh, returned) : { ...fresh, canApply: false, canRecover: false }; } catch { returned = null; known = { ...fresh, canApply: false, canRecover: false }; }
  try {
    const latest = await ports.read(fresh.receiptId);
    const context = ports.context();
    if (!context.current || !context.allowed || !matchesReviewScope(latest, context.scope) || latest.reviewFingerprint !== fresh.reviewFingerprint || latest.receiptId !== fresh.receiptId) throw new StaleConfirmationError();
    // Never replace an acknowledged result with an earlier or incomplete receipt response.
    if (returned && (!latest.applyState || latest.applyState.updatedAt < returned.updatedAt || (["applied", "rejected", "rolled-back"].includes(returned.status) && latest.applyState.status !== returned.status))) return { review: known, unknown: false, refreshFailed: true };
    return { review: latest, unknown: !returned && !latest.applyState, refreshFailed: false };
  } catch {
    if (!ports.context().current || !ports.context().allowed) throw new StaleConfirmationError();
    return { review: known, unknown: !returned, refreshFailed: true };
  }
}

export type PendingReceipt = { receiptId: string; reviewFingerprint: string };
export function parsePendingReceipt(raw: string | null): PendingReceipt | null {
  if (!raw || raw.length > 500) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("receiptId" in value) || typeof value.receiptId !== "string" || !value.receiptId || value.receiptId.length > 200 || !("reviewFingerprint" in value) || typeof value.reviewFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(value.reviewFingerprint)) return null;
    return { receiptId: value.receiptId, reviewFingerprint: value.reviewFingerprint };
  } catch { return null; }
}
/** An expired authoritative receipt with no apply row cannot subsequently pass the broker's claim guard. */
export function pendingReceiptResolved(marker: PendingReceipt | null, review: Review, authoritative: boolean, now = Date.now()) {
  return !!marker && marker.receiptId === review.receiptId && marker.reviewFingerprint === review.reviewFingerprint && (!!review.applyState || (authoritative && review.status === "expired" && review.expiresAt <= now && !review.applyState));
}
