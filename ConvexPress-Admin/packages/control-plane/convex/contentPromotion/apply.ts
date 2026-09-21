"use node";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference, type FunctionArgs, type FunctionReturnType, type ApiFromModules } from "convex/server";
import { v } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { ContentPromotionManifest } from "@convexpress/site-contract/content-promotion";
import type * as records from "./applyRecords";
import { ATOMIC_SITE_REFUSALS, ApplyGuardError, appliedSchema, applyErrorCode, applySummaryValidator, statusSchema, type ApplySummary, type ApplyWork } from "./applyPolicy";
import { hash, requestSchema, validateExport, type BrokerRequest, type BrokerTarget } from "./policy";
import { boundedSiteFetch, exchangeBrokerSession } from "./review";

type RecordApi = ApiFromModules<{ records: typeof records }>["records"];
type Confirmation = { receiptId: Id<"overseer_contentPromotionReviews">; expectedReviewFingerprint: string; confirmLive: true };
const claimRef = makeFunctionReference<"mutation", FunctionArgs<RecordApi["claim"]>, FunctionReturnType<RecordApi["claim"]>>("contentPromotion/applyRecords:claim");
const dispatchRef = makeFunctionReference<"mutation", FunctionArgs<RecordApi["dispatch"]>, null>("contentPromotion/applyRecords:dispatch");
const finishRef = makeFunctionReference<"mutation", FunctionArgs<RecordApi["finish"]>, null>("contentPromotion/applyRecords:finish");
const getRef = makeFunctionReference<"query", { receiptId: Id<"overseer_contentPromotionReviews"> }, ApplySummary | null>("contentPromotion/applyRecords:get");
const statusRef = makeFunctionReference<"query", { receiptId: string }, unknown>("contentPromotion/operations:receiptStatus");
const applyRef = makeFunctionReference<"mutation", { receiptId: string; expectedDigest: string; confirmLive: boolean }, unknown>("contentPromotion/operations:apply");
const retireRef = makeFunctionReference<"mutation", { receiptId: string; expectedDigest: string }, unknown>("contentPromotion/operations:retireExpiredReview");
const exportRef = makeFunctionReference<"query", { target: BrokerTarget["identity"]; selection: BrokerRequest["selection"] }, unknown>("contentPromotion/operations:exportManifest");
export interface ApplyTransport {
  retire(target: BrokerTarget, token: string, receiptId: string, expectedDigest: string): Promise<unknown>;
  status(target: BrokerTarget, token: string, receiptId: string): Promise<unknown>;
  export(source: BrokerTarget, token: string, request: BrokerRequest, target: BrokerTarget): Promise<unknown>;
  apply(target: BrokerTarget, token: string, receiptId: string, expectedDigest: string): Promise<unknown>;
}
function client(target: BrokerTarget, token: string) { return new ConvexHttpClient(target.identity.deploymentOrigin, { auth: token, logger: false, fetch: boundedSiteFetch(target.identity.deploymentOrigin) }); }
async function usingClient<T>(target: BrokerTarget, token: string, read: (value: ConvexHttpClient) => Promise<T>) {
  const value = client(target, token); try { return await read(value); } finally { value.clearAuth(); }
}
const transport: ApplyTransport = {
  retire: (target, token, receiptId, expectedDigest) => usingClient(target, token, value => value.mutation(retireRef, { receiptId, expectedDigest })),
  status: (target, token, receiptId) => usingClient(target, token, value => value.query(statusRef, { receiptId })),
  export: (source, token, request, target) => usingClient(source, token, value => value.query(exportRef, { target: target.identity, selection: request.selection })),
  apply: (target, token, receiptId, expectedDigest) => usingClient(target, token, value => value.mutation(applyRef, { receiptId, expectedDigest, confirmLive: true })),
};
function safeEvidence(value: unknown, tokens: string[]) {
  const text = JSON.stringify(value);
  if (typeof text !== "string" || new TextEncoder().encode(text).length > 100_000 || tokens.some(token => text.includes(token))) throw new ApplyGuardError("SITE_APPLY_INVALID");
  return text;
}
function verifyStatus(value: unknown, work: ApplyWork) {
  const status = statusSchema.nullable().parse(value);
  if (!status || status.receiptId !== work.siteReceiptId || status.digest !== work.siteDigest || status.targetInstanceKey !== work.target.identity.instanceKey) throw new ApplyGuardError("TARGET_RECEIPT_INVALID");
  return status;
}
/** Explicit retries reuse the immutable target receipt. No new dry-run, upload or snapshot operation is available here. */
export async function runApply(ctx: ActionCtx, args: Confirmation, remote: ApplyTransport = transport): Promise<ApplySummary> {
  if (args.confirmLive !== true || !/^[0-9a-f]{64}$/.test(args.expectedReviewFingerprint)) throw new Error("Confirm the exact reviewed fingerprint before applying");
  const leaseId = crypto.randomUUID();
  const claimed = await ctx.runMutation(claimRef, { ...args, leaseId });
  async function summary() { const result = await ctx.runQuery(getRef, { receiptId: args.receiptId }); if (!result) throw new Error("Apply receipt is unavailable"); return result; }
  if (!claimed.work) return summary();
  const work = claimed.work; const tokens: string[] = []; let dispatched = false; let targetRefusal: string | null = null;
  const finish = (outcome: FunctionArgs<RecordApi["finish"]>["outcome"], failureCode?: string, evidenceJson?: string) => ctx.runMutation(finishRef, { applyId: claimed.applyId, leaseId, outcome, ...(failureCode ? { failureCode } : {}), ...(evidenceJson ? { evidenceJson } : {}) });
  try {
    let targetSession = await exchangeBrokerSession(ctx, work.target); tokens.push(targetSession.token);
    const rawStatus = await remote.status(work.target, targetSession.token, work.siteReceiptId);
    safeEvidence(rawStatus, tokens);
    let status = verifyStatus(rawStatus, work);
    // A ready query is only a snapshot: an earlier dispatch can still be in flight.
    // Atomically fence an expired receipt before declaring it unapplied. If apply
    // wins the transaction race, retirement returns that committed outcome instead.
    if (status.status === "ready" && status.expiresAt <= Date.now() && work.wasDispatched) {
      const retired = await remote.retire(work.target, targetSession.token, work.siteReceiptId, work.siteDigest);
      safeEvidence(retired, tokens);
      status = verifyStatus(retired, work);
      if (status.status === "ready") throw new ApplyGuardError("TARGET_RECEIPT_INVALID");
    }
    if (status.status === "retired") {
      await finish("rejected", "REVIEW_EXPIRED", safeEvidence({ kind: "status", result: status }, tokens));
      return summary();
    }
    if (status.status === "applied" || status.status === "rolled-back") {
      await finish(status.status, status.status === "rolled-back" ? "TARGET_ROLLED_BACK" : undefined, safeEvidence({ kind: "status", result: status }, tokens));
      return summary();
    }
    if (status.expiresAt <= Date.now() || work.reviewExpiresAt <= Date.now()) throw new ApplyGuardError("REVIEW_EXPIRED");
    if (!work.authorityCurrent) throw new ApplyGuardError("AUTHORITY_CHANGED");
    const sourceSession = await exchangeBrokerSession(ctx, work.source); tokens.push(sourceSession.token);
    const request = requestSchema.parse(JSON.parse(work.requestJson));
    const current = validateExport(await remote.export(work.source, sourceSession.token, request, work.target), work.source, work.target);
    const currentJson = JSON.stringify(current);
    if (tokens.some(token => currentJson.includes(token))) throw new ApplyGuardError("SOURCE_CHANGED");
    const reviewed: ContentPromotionManifest = JSON.parse(work.manifestJson);
    if (hash(current) !== hash(reviewed) || hash(current.records.map(record => [record.key, record.sourceRevision])) !== hash(reviewed.records.map(record => [record.key, record.sourceRevision]))) throw new ApplyGuardError("SOURCE_CHANGED");
    if (targetSession.expiresAt <= Date.now() + 10_000) { targetSession = await exchangeBrokerSession(ctx, work.target); tokens.push(targetSession.token); }
    await ctx.runMutation(dispatchRef, { applyId: claimed.applyId, leaseId, sourceManifestJson: currentJson });
    dispatched = true;
    let rawResult: unknown;
    try { rawResult = await remote.apply(work.target, targetSession.token, work.siteReceiptId, work.siteDigest); }
    catch (error) {
      // Only this exact call can provide proof that the atomic target mutation refused its write.
      const code = applyErrorCode(error);
      if (ATOMIC_SITE_REFUSALS.has(code)) targetRefusal = code;
      throw error;
    }
    safeEvidence(rawResult, tokens);
    const result = appliedSchema.parse(rawResult);
    if (result.receiptId !== work.siteReceiptId || result.digest !== work.siteDigest) throw new ApplyGuardError("SITE_APPLY_INVALID");
    await finish("applied", undefined, safeEvidence({ kind: "apply", result }, tokens));
  } catch (error) {
    const code = applyErrorCode(error, dispatched || work.wasDispatched ? "APPLY_TRANSPORT_UNCERTAIN" : "SOURCE_CHECK_FAILED");
    const firstAtomicRefusal = dispatched && !work.wasDispatched && targetRefusal === code;
    const rejectedBeforeDispatch = !dispatched && !work.wasDispatched && ["SOURCE_CHANGED", "REVIEW_EXPIRED", "AUTHORITY_CHANGED", "TARGET_RECEIPT_INVALID"].includes(code);
    try {
      await finish(firstAtomicRefusal || rejectedBeforeDispatch ? "rejected" : "uncertain", code, firstAtomicRefusal ? safeEvidence({ kind: "rejection", code }, tokens) : undefined);
    } catch {
      // An acknowledgement or lease may have changed. Never turn ambiguous dispatch history into a false rejection.
      try { await finish("uncertain", code); } catch { throw new Error("Apply outcome requires recovery under current access"); }
    }
  }
  return summary();
}
export const execute = action({
  args: { receiptId: v.id("overseer_contentPromotionReviews"), expectedReviewFingerprint: v.string(), confirmLive: v.literal(true) },
  returns: applySummaryValidator,
  handler: (ctx, args) => runApply(ctx, args),
});
