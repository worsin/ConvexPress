import { mediaReadiness } from "./mediaReadiness";
import { promotionChangeKindSchema, promotionReviewedRecords } from '@convexpress/site-contract/content-promotion';
import { z } from "zod";
import { ConvexError, v, type Infer } from "convex/values";
import {
	contentPromotionManifestSchema,
	promotionDataSchemas,
	type PromotionKind,
} from "@convexpress/site-contract/content-promotion";
import type { Doc } from "../_generated/dataModel";
import {
	hash,
	requestSchema,
	reviewFingerprint,
	siteReviewSchema,
} from "./policy";
import { targetValidator, type ApplySummary } from "./validators";
export { applySummaryValidator, type ApplySummary } from "./validators";
export const APPLY_LEASE_MS = 120_000;
export const APPLY_CODES = new Set([
	"CANONICAL_READ_BUDGET",
	"APPLY_TRANSPORT_UNCERTAIN",
	"SOURCE_CHANGED",
	"REVIEW_EXPIRED",
	"AUTHORITY_CHANGED",
	"TARGET_RECEIPT_INVALID",
	"TARGET_ROLLED_BACK",
	"SITE_APPLY_INVALID",
	"SOURCE_CHECK_FAILED",
	"PROMOTION_CONFLICT",
	"PROMOTION_RECEIPT_INVALID",
	"PROMOTION_TARGET_MISMATCH",
	"PROMOTION_REVIEW_EXPIRED",
	"PROMOTION_DEPENDENCY_MISSING",
	"PROMOTION_MEDIA_INVALID",
	"PROMOTION_MEDIA_MISSING",
	"FORBIDDEN",
	"PLUGIN_DISABLED",
]);
export const ATOMIC_SITE_REFUSALS = new Set([
	"CANONICAL_READ_BUDGET",
	"PROMOTION_CONFLICT",
	"PROMOTION_RECEIPT_INVALID",
	"PROMOTION_TARGET_MISMATCH",
	"PROMOTION_REVIEW_EXPIRED",
	"PROMOTION_DEPENDENCY_MISSING",
	"PROMOTION_MEDIA_INVALID",
	"PROMOTION_MEDIA_MISSING",
	"FORBIDDEN",
	"PLUGIN_DISABLED",
]);
export class ApplyGuardError extends ConvexError<{ code: string }> {
	constructor(public readonly code: string) {
		super({ code });
	}
}
export function applyErrorCode(
	error: unknown,
	fallback = "APPLY_TRANSPORT_UNCERTAIN",
) {
	if (error instanceof ApplyGuardError && APPLY_CODES.has(error.code))
		return error.code;
	if (
		error &&
		typeof error === "object" &&
		"data" in error &&
		error.data &&
		typeof error.data === "object" &&
		"code" in error.data &&
		typeof error.data.code === "string" &&
		APPLY_CODES.has(error.data.code)
	)
		return error.data.code;
	return fallback;
}
const kind = promotionChangeKindSchema;
export const mappingSchema = z
	.object({
		key: z.string().min(1).max(500),
		kind,
		targetId: z.string().min(1).max(200),
	})
	.strict();
export const appliedSchema = z
	.object({
		receiptId: z.string().min(1).max(200),
		digest: z.string().regex(/^[0-9a-f]{64}$/),
		status: z.literal("applied"),
		mappings: z.array(mappingSchema).max(100),
	})
	.strict();
export const statusSchema = z
	.object({
		receiptId: z.string().min(1).max(200),
		digest: z.string().regex(/^[0-9a-f]{64}$/),
		status: z.enum(["ready", "applied", "rolled-back", "retired"]),
		targetInstanceKey: z.string().min(1).max(500),
		expiresAt: z.number(),
	})
	.strict();
export const evidenceSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("apply"), result: appliedSchema }).strict(),
	z.object({ kind: z.literal("status"), result: statusSchema }).strict(),
	z
		.object({ kind: z.literal("rejection"), code: z.string().max(100) })
		.strict(),
]);
export function reviewedEnvelope(
	receipt: Doc<"overseer_contentPromotionReviews">,
) {
	if (
		receipt.status !== "reviewed" ||
		!receipt.manifestJson ||
		!receipt.reviewJson ||
		!receipt.siteReceiptId ||
		!receipt.siteDigest ||
		new TextEncoder().encode(receipt.manifestJson).length > 500_000 ||
		new TextEncoder().encode(receipt.reviewJson).length > 250_000 ||
		new TextEncoder().encode(receipt.requestJson).length > 100_000
	)
		throw new ApplyGuardError("TARGET_RECEIPT_INVALID");
	const manifest = contentPromotionManifestSchema.parse(
		JSON.parse(receipt.manifestJson),
	);
	const review = siteReviewSchema.parse(JSON.parse(receipt.reviewJson));
	const request = requestSchema.parse(JSON.parse(receipt.requestJson));
	const resolvedMedia = mediaReadiness(manifest, request, review);
  const reviewedRecords = promotionReviewedRecords(manifest);
	if (
		!review.ready ||
		review.issues.length ||
		manifest.issues.length ||
		review.receiptId !== receipt.siteReceiptId ||
		review.digest !== receipt.siteDigest ||
		hash(manifest) !== receipt.manifestHash ||
		hash(
			manifest.records.map((record) => [record.key, record.sourceRevision]),
		) !== receipt.sourceRevisionHash ||
		hash(manifest.selection) !== hash(request.selection) ||
		hash({
			sourceConnectionId: receipt.sourceConnectionId,
			targetConnectionId: receipt.targetConnectionId,
			request,
		}) !== receipt.requestHash ||
		!resolvedMedia.ready ||
		review.changes.length !== reviewedRecords.length ||
		new Set(review.changes.map((change) => change.key)).size !==
			reviewedRecords.length ||
		review.changes.some(
			(change) =>
				reviewedRecords.find((record) => record.key === change.key)?.kind !==
				change.kind,
		)
	)
		throw new ApplyGuardError("TARGET_RECEIPT_INVALID");
	return { manifest, review, request, fingerprint: reviewFingerprint(receipt) };
}
export const applyWorkValidator = v.object({
	source: targetValidator,
	target: targetValidator,
	manifestJson: v.string(),
	requestJson: v.string(),
	siteReceiptId: v.string(),
	siteDigest: v.string(),
	reviewExpiresAt: v.number(),
	authorityCurrent: v.boolean(),
	wasDispatched: v.boolean(),
});
export type ApplyWork = Infer<typeof applyWorkValidator>;
export const claimValidator = v.object({
	applyId: v.id("overseer_contentPromotionApplies"),
	work: v.union(applyWorkValidator, v.null()),
});
export function terminal(status: string) {
	return ["applied", "rejected", "rolled-back"].includes(status);
}
export function applySummary(
	row: Doc<"overseer_contentPromotionApplies">,
): ApplySummary {
	return {
		applyId: row._id,
		receiptId: row.receiptId,
		reviewFingerprint: row.reviewFingerprint,
		status: row.status,
		canApply: false,
		recoveryNeeded: !terminal(row.status) && row.leaseExpiresAt <= Date.now(),
		attempt: row.attempt,
		dispatchCount: row.dispatchCount,
		sourceCheckedAt: row.sourceCheckedAt ?? null,
		dispatchedAt: row.dispatchedAt ?? null,
		retryAfter:
			!terminal(row.status) && row.leaseExpiresAt > Date.now()
				? row.leaseExpiresAt
				: null,
		failureCode: row.failureCode ?? null,
		mappings: row.mappingsJson
			? z.array(mappingSchema).max(100).parse(JSON.parse(row.mappingsJson))
			: null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		finishedAt: row.finishedAt ?? null,
	};
}
