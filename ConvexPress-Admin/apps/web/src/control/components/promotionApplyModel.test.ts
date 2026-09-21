import { expect, test } from "bun:test";
import type { Id } from "@control/convex/_generated/dataModel";
import { availableApplyMode, confirmationIsCurrent, parsePendingReceipt, pendingReceiptResolved, prepareApplyConfirmation, submitReviewedConfirmation, type ApplyResult, type ReviewScope } from "./promotionApplyModel";
import type { Review } from "./promotionReviewModel";
const scope: ReviewScope = { operatorId: "operator", websiteId: "website", websiteKey: "aster", sourceConnectionId: "source", targetConnectionId: "target", sourceInstanceKey: "stage", targetInstanceKey: "live", sourceDeploymentOrigin: "https://stage.convex.cloud", targetDeploymentOrigin: "https://live.convex.cloud", sourceSiteOrigin: "https://stage.example", targetSiteOrigin: "https://live.example" };
function fixture(): Review {
  return { sourceIdentity: { websiteKey: "aster", instanceKey: "stage", deploymentOrigin: scope.sourceDeploymentOrigin, siteOrigin: scope.sourceSiteOrigin, environmentKind: "staging", schemaVersion: "1" }, targetIdentity: { websiteKey: "aster", instanceKey: "live", deploymentOrigin: scope.targetDeploymentOrigin, siteOrigin: scope.targetSiteOrigin, environmentKind: "live", schemaVersion: "1" }, receiptId: "receipt" as Id<"overseer_contentPromotionReviews">, sourceConnectionId: "source" as Id<"overseer_connections">, targetConnectionId: "target" as Id<"overseer_connections">, status: "reviewed", canApply: true, canRecover: false, applyState: null, reviewReady: true, mediaReady: true, requestHash: "request", authorityHash: "authority", manifestHash: "manifest", sourceRevisionHash: "revision", reviewFingerprint: "a".repeat(64), recordCount: 1, authoredRecords: [{ key: "page:one", kind: "page", sourceRevision: "revision", dataJson: JSON.stringify({ title: "Care", slug: "care", status: "draft", visibility: "public", commentStatus: "closed" }) }], mediaRequired: 0, mediaProvided: 0, issues: [], changes: [], failureCode: null, createdAt: 0, expiresAt: 200 };
}
function applied(review: Review): ApplyResult { return { applyId: "apply" as Id<"overseer_contentPromotionApplies">, receiptId: review.receiptId, reviewFingerprint: review.reviewFingerprint, status: "applied", canApply: false, recoveryNeeded: false, attempt: 1, dispatchCount: 1, sourceCheckedAt: 110, dispatchedAt: 110, retryAfter: null, failureCode: null, mappings: null, createdAt: 110, updatedAt: 120, finishedAt: 120 }; }
async function rejects(promise: Promise<unknown>) { try { await promise; return false; } catch { return true; } }
test("local eligibility never turns server refusal, blocked data, expiry or invalid authored values into readiness", () => {
  const review = fixture(); expect(availableApplyMode(review, scope, true, 100)).toBe("apply");
  for (const invalid of [{ ...review, canApply: false }, { ...review, mediaReady: false }, { ...review, status: "blocked" }, { ...review, expiresAt: 100 }, { ...review, authoredRecords: [{ ...review.authoredRecords[0], dataJson: "{}" }] }] as Review[]) expect(availableApplyMode(invalid, scope, true, 100)).toBeNull();
  expect(availableApplyMode(review, scope, false, 100)).toBeNull();
});
test("operator, website, environment, fingerprint and server-state changes invalidate the confirmation", () => {
  const review = fixture(); const confirmation = prepareApplyConfirmation(review, scope, true, 100)!;
  for (const changed of [{ ...scope, operatorId: "other" }, { ...scope, websiteId: "other" }, { ...scope, targetDeploymentOrigin: "https://other.convex.cloud" }]) expect(confirmationIsCurrent(confirmation, review, changed, true, 100)).toBe(false);
  expect(confirmationIsCurrent(confirmation, { ...review, reviewFingerprint: "b".repeat(64) }, scope, true, 100)).toBe(false);
  expect(confirmationIsCurrent(confirmation, { ...review, canApply: false }, scope, true, 100)).toBe(false);
  expect(confirmationIsCurrent(confirmation, review, scope, false, 100)).toBe(false);
});
test("explicit acknowledgement plus fresh authorization precede the one exact apply request and durable readback", async () => {
  const review = fixture(); const confirmation = prepareApplyConfirmation(review, scope, true, 100)!; const calls: string[] = []; const result = applied(review);
  const ports = { context: () => ({ scope, allowed: true, current: true, now: 100 }), read: async () => { calls.push("read"); return calls.includes("execute") ? { ...review, canApply: false, reviewReady: false, applyState: result } : review; }, execute: async (args: unknown) => { calls.push("execute"); expect(args).toEqual({ receiptId: review.receiptId, expectedReviewFingerprint: review.reviewFingerprint, confirmLive: true }); return result; }, dispatched: () => { calls.push("persist pending"); } };
  expect(await rejects(submitReviewedConfirmation(confirmation, false, ports))).toBe(true); expect(calls).toHaveLength(0);
  expect((await submitReviewedConfirmation(confirmation, true, ports)).review.applyState?.status).toBe("applied"); expect(calls).toEqual(["read", "persist pending", "execute", "read"]);
});
test("a scope change during the pre-submit read or an already consumed receipt prevents execution", async () => {
  const review = fixture(); const confirmation = prepareApplyConfirmation(review, scope, true, 100)!; let current = true; let executions = 0;
  const ports = { context: () => ({ scope, allowed: true, current, now: 100 }), read: async () => { current = false; return review; }, execute: async () => { executions++; return applied(review); }, dispatched() {} };
  expect(await rejects(submitReviewedConfirmation(confirmation, true, ports))).toBe(true); expect(executions).toBe(0);
  current = true; ports.read = async () => ({ ...review, canApply: false, applyState: applied(review) });
  expect(await rejects(submitReviewedConfirmation(confirmation, true, ports))).toBe(true); expect(executions).toBe(0);
});
test("lost apply response triggers readback only; it never automatically repeats a write", async () => {
  const review = fixture(); const confirmation = prepareApplyConfirmation(review, scope, true, 100)!; let reads = 0; let writes = 0;
  const result = await submitReviewedConfirmation(confirmation, true, { context: () => ({ scope, allowed: true, current: true, now: 100 }), read: async () => ++reads === 1 ? review : { ...review, canApply: false, reviewReady: false, applyState: applied(review) }, execute: async () => { writes++; throw new Error("Response lost"); }, dispatched() {} });
  expect(result.review.applyState?.status).toBe("applied"); expect(result.unknown).toBe(false); expect(writes).toBe(1); expect(reads).toBe(2);
});
test("unknown controller outcome is explicit and a readback failure cannot manufacture a ready state", async () => {
  const review = fixture(); const confirmation = prepareApplyConfirmation(review, scope, true, 100)!; let reads = 0;
  const result = await submitReviewedConfirmation(confirmation, true, { context: () => ({ scope, allowed: true, current: true, now: 100 }), read: async () => { if (++reads > 1) throw new Error("Disconnected"); return review; }, execute: async () => { throw new Error("Disconnected"); }, dispatched() {} });
  expect(result.unknown).toBe(true); expect(result.refreshFailed).toBe(true); expect(result.review.canApply).toBe(false);
});
test("recovery requires its own server permission and never enables a new apply after completion", () => {
  const review = fixture(); const state = { ...applied(review), status: "uncertain" as const, recoveryNeeded: true, finishedAt: null };
  const uncertain = { ...review, canApply: false, reviewReady: false, canRecover: true, applyState: state };
  expect(availableApplyMode(uncertain, scope, true, 300)).toBe("recover");
  expect(availableApplyMode({ ...uncertain, canRecover: false }, scope, true, 100)).toBeNull();
  expect(availableApplyMode({ ...uncertain, applyState: applied(review) }, scope, true, 100)).toBeNull();
});

test("access revoked while an apply response is in flight never presents an authorized result", async () => {
  const review = fixture(); const confirmation = prepareApplyConfirmation(review, scope, true, 100)!; let allowed = true; let calls = 0;
  expect(await rejects(submitReviewedConfirmation(confirmation, true, { context: () => ({ scope, allowed, current: true, now: 100 }), read: async () => review, execute: async () => { calls++; allowed = false; return applied(review); }, dispatched() {} }))).toBe(true);
  expect(calls).toBe(1);
});
test("failed pending-receipt persistence prevents dispatch; no untracked write is sent", async () => {
  const review = fixture(); const confirmation = prepareApplyConfirmation(review, scope, true, 100)!; let calls = 0;
  expect(await rejects(submitReviewedConfirmation(confirmation, true, { context: () => ({ scope, allowed: true, current: true, now: 100 }), read: async () => review, execute: async () => { calls++; return applied(review); }, dispatched() { throw new Error("Storage unavailable"); } }))).toBe(true);
  expect(calls).toBe(0);
});


test("saved pending metadata is bounded and only matching durable or definitively expired readback releases it", () => {
  const review = fixture(); const marker = { receiptId: review.receiptId, reviewFingerprint: review.reviewFingerprint };
  expect(parsePendingReceipt(JSON.stringify(marker))).toEqual(marker);
  for (const raw of [null, "{", "{}", JSON.stringify({ ...marker, reviewFingerprint: "wrong" }), "x".repeat(501)]) expect(parsePendingReceipt(raw)).toBeNull();
  expect(pendingReceiptResolved(marker, review, true, 100)).toBe(false);
  expect(pendingReceiptResolved(marker, { ...review, applyState: applied(review) }, false, 100)).toBe(true);
  expect(pendingReceiptResolved(marker, { ...review, status: "expired" }, true, 300)).toBe(true);
  expect(pendingReceiptResolved(marker, { ...review, status: "expired" }, false, 300)).toBe(false);
  expect(pendingReceiptResolved({ ...marker, receiptId: "other" }, { ...review, applyState: applied(review) }, true, 100)).toBe(false);
});

test("a stale readback cannot replace acknowledged applied state with checking", async () => {
  const review = fixture(); const confirmation = prepareApplyConfirmation(review, scope, true, 100)!; let reads = 0;
  const result = await submitReviewedConfirmation(confirmation, true, { context: () => ({ scope, allowed: true, current: true, now: 100 }), read: async () => ++reads === 1 ? review : { ...review, canApply: false, applyState: { ...applied(review), status: "checking", finishedAt: null } }, execute: async () => applied(review), dispatched() {} });
  expect(result.review.applyState?.status).toBe("applied"); expect(result.unknown).toBe(false); expect(result.refreshFailed).toBe(true);
});
