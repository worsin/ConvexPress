import { v, type Infer } from "convex/values";
import {
	internalMutation,
	internalQuery,
	query,
	type QueryCtx,
	type MutationCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
	mediaConfirmationArgs,
	mediaWorkValidator,
	loadMediaContext,
	type MediaConfirmation,
} from "./mediaTransferRecords";
import { hash } from "./policy";
import {
	recoveryDisposition,
	recoveryEvidenceHash,
	type RecoveryEvidence,
} from "./mediaRecoveryProtocol";
import { contentPromotionManifestSchema } from "@convexpress/site-contract/content-promotion";
const confirmationArgs = {
	recoveryId: v.id("overseer_contentPromotionMediaRecoveries"),
	expectedFingerprint: v.string(),
};
export const recoverySummaryValidator = v.object({
	recoveryId: v.id("overseer_contentPromotionMediaRecoveries"),
	receiptId: v.id("overseer_contentPromotionReviews"),
	mediaKey: v.string(),
	fingerprint: v.string(),
	status: v.union(
		v.literal("prepared"),
		v.literal("granting"),
		v.literal("verified"),
	),
	creatorId: v.id("overseer_users"),
	beneficiaryId: v.id("overseer_users"),
	reason: v.string(),
	expiresAt: v.number(),
	retryAfter: v.union(v.number(), v.null()),
	storageId: v.union(v.string(), v.null()),
	canConfirm: v.boolean(),
});
export type RecoverySummary = Infer<typeof recoverySummaryValidator>;
function summary(
	row: Doc<"overseer_contentPromotionMediaRecoveries">,
): RecoverySummary {
	return {
		recoveryId: row._id,
		receiptId: row.receiptId,
		mediaKey: row.mediaKey,
		fingerprint: row.fingerprint,
		status: row.status,
		creatorId: row.creatorId,
		beneficiaryId: row.operatorId,
		reason: row.reason,
		expiresAt: row.expiresAt,
		retryAfter: row.leaseExpiresAt > Date.now() ? row.leaseExpiresAt : null,
		storageId: row.status === "verified" ? row.storageId : null,
		canConfirm:
			row.status !== "verified" &&
			row.expiresAt > Date.now() &&
			row.leaseExpiresAt <= Date.now(),
	};
}
export function transferEvidence(
	row: Doc<"overseer_contentPromotionMedia">,
): RecoveryEvidence {
	return {
		transferKey: row.transferKey,
		targetIntentId: row.targetIntentId ?? null,
		storageId: row.storageId ?? null,
		phase: row.phase,
		dispatchCount: row.dispatchCount,
		leaseExpiresAt: row.leaseExpiresAt,
	};
}
async function context(
	ctx: QueryCtx | MutationCtx,
	args: MediaConfirmation,
	fresh = false,
) {
	const current = await loadMediaContext(ctx, args, fresh);
	const transfer = await ctx.db
		.query("overseer_contentPromotionMedia")
		.withIndex("by_transfer_key", (q) =>
			q.eq("transferKey", current.work.transferKey),
		)
		.unique();
	if (
		!transfer ||
		transfer.sourceIdentityJson !==
			JSON.stringify(current.work.source.identity) ||
		transfer.targetIdentityJson !==
			JSON.stringify(current.work.target.identity) ||
		hash({
			sha256: transfer.sha256,
			fileSize: transfer.fileSize,
			mimeType: transfer.mimeType,
		}) !== hash(current.work.media)
	)
		throw new Error("MEDIA_RECOVERY_SCOPE_CHANGED");
	return { ...current, transfer };
}
export const inspect = internalQuery({
	args: mediaConfirmationArgs,
	returns: v.object({
		work: mediaWorkValidator,
		transferId: v.id("overseer_contentPromotionMedia"),
		evidence: v.object({
			transferKey: v.string(),
			targetIntentId: v.union(v.string(), v.null()),
			storageId: v.union(v.string(), v.null()),
			phase: v.union(
				v.literal("planned"),
				v.literal("uploading"),
				v.literal("uploaded"),
				v.literal("verified"),
				v.literal("uncertain"),
			),
			dispatchCount: v.number(),
			leaseExpiresAt: v.number(),
		}),
		evidenceHash: v.string(),
	}),
	handler: async (ctx, args) => {
		const c = await context(ctx, args, true);
		return {
			work: c.work,
			transferId: c.transfer._id,
			evidence: transferEvidence(c.transfer),
			evidenceHash: recoveryEvidenceHash(transferEvidence(c.transfer)),
		};
	},
});
export const prepare = internalMutation({
	args: {
		...mediaConfirmationArgs,
		expectedEvidenceHash: v.string(),
		sourceManifestJson: v.string(),
		targetCreatorId: v.string(),
		targetIntentId: v.string(),
		storageId: v.string(),
		targetStatus: v.union(v.literal("issued"), v.literal("verified")),
		reason: v.string(),
	},
	returns: recoverySummaryValidator,
	handler: async (ctx, args) => {
		const c = await context(ctx, args, true);
		const e = transferEvidence(c.transfer);
		if (
			args.reason.trim().length < 1 ||
			args.reason.length > 500 ||
			args.targetCreatorId.length > 200 ||
			!args.targetCreatorId ||
			!/^[A-Za-z0-9_-]{1,200}$/.test(args.storageId) ||
			recoveryEvidenceHash(e) !== args.expectedEvidenceHash ||
			hash(
				contentPromotionManifestSchema.parse(
					JSON.parse(args.sourceManifestJson),
				),
			) !== hash(JSON.parse(c.work.manifestJson))
		)
			throw new Error("MEDIA_RECOVERY_REVIEW_CHANGED");
		const disposition = recoveryDisposition(
			e,
			{
				intentId: args.targetIntentId,
				storageId: args.targetStatus === "verified" ? args.storageId : null,
				status: args.targetStatus,
			},
			Date.now(),
		);
		if (
			disposition === "busy" ||
			disposition === "unresolved" ||
			(disposition === "known-storage" && e.storageId !== args.storageId)
		)
			throw new Error("MEDIA_RECOVERY_EXISTING_BYTES_REQUIRED");
		const existing = await ctx.db
			.query("overseer_contentPromotionMediaRecoveries")
			.withIndex("by_review_transfer", (q) =>
				q.eq("receiptId", args.receiptId).eq("transferKey", e.transferKey),
			)
			.unique();
		if (existing) {
			if (
				existing.status === "prepared" &&
				existing.evidenceHash !== args.expectedEvidenceHash
			)
				throw new Error("MEDIA_RECOVERY_NEW_REVIEW_REQUIRED");
			if (
				existing.operatorId !== c.pair.operatorId ||
				existing.reviewFingerprint !== args.expectedReviewFingerprint ||
				existing.reason !== args.reason ||
				existing.storageId !== args.storageId ||
				existing.targetCreatorId !== args.targetCreatorId ||
				existing.targetIntentId !== args.targetIntentId
			)
				throw new Error("MEDIA_RECOVERY_REVIEW_CHANGED");
			return summary(existing);
		}
		const createdAt = Date.now(),
			expiresAt = Math.min(c.receipt.expiresAt, createdAt + 15 * 60_000);
		const binding = {
			receiptId: args.receiptId,
			reviewFingerprint: args.expectedReviewFingerprint,
			transferKey: e.transferKey,
			mediaKey: args.mediaKey,
			operatorId: c.pair.operatorId,
			creatorId: c.transfer.operatorId,
			previousReceiptId: c.transfer.receiptId,
			targetCreatorId: args.targetCreatorId,
			targetIntentId: args.targetIntentId,
			storageId: args.storageId,
			reason: args.reason,
			evidenceHash: args.expectedEvidenceHash,
			authorityHash: c.pair.authorityHash,
			expiresAt,
		};
		const fingerprint = hash(binding);
		const id = await ctx.db.insert("overseer_contentPromotionMediaRecoveries", {
			...binding,
			transferId: c.transfer._id,
			fingerprint,
			recoveryKey: hash({
				fingerprint,
				source: c.work.source.identity,
				target: c.work.target.identity,
			}),
			status: "prepared",
			leaseId: "",
			leaseExpiresAt: 0,
			createdAt,
			updatedAt: createdAt,
		});
		await ctx.db.insert("overseer_contentPromotionMediaRecoveryAudit", {
			recoveryId: id,
			actorId: c.pair.operatorId,
			event: "prepared",
			createdAt,
		});
		return summary((await ctx.db.get(id))!);
	},
});
async function owned(
	ctx: QueryCtx | MutationCtx,
	args: {
		recoveryId: Id<"overseer_contentPromotionMediaRecoveries">;
		expectedFingerprint: string;
	},
	fresh = false,
) {
	const row = await ctx.db.get(args.recoveryId);
	if (!row || row.fingerprint !== args.expectedFingerprint)
		throw new Error("MEDIA_RECOVERY_NOT_FOUND");
	const c = await context(
		ctx,
		{
			receiptId: row.receiptId,
			expectedReviewFingerprint: row.reviewFingerprint,
			mediaKey: row.mediaKey,
		},
		fresh,
	);
	if (
		c.pair.operatorId !== row.operatorId ||
		c.transfer._id !== row.transferId ||
		c.transfer.operatorId !== row.creatorId ||
		c.transfer.targetIntentId !== row.targetIntentId ||
		(c.transfer.storageId && c.transfer.storageId !== row.storageId)
	)
		throw new Error("MEDIA_RECOVERY_SCOPE_CHANGED");
	if (
		fresh &&
		(row.expiresAt <= Date.now() || row.authorityHash !== c.pair.authorityHash)
	)
		throw new Error("MEDIA_RECOVERY_REVIEW_EXPIRED");
	return { ...c, row };
}
export const get = query({
	args: confirmationArgs,
	returns: recoverySummaryValidator,
	handler: async (ctx, args) => {
		const c = await owned(ctx, args);
		const result = summary(c.row);
		return {
			...result,
			canConfirm:
				result.canConfirm && c.row.authorityHash === c.pair.authorityHash,
		};
	},
});
const workValidator = v.object({
	work: mediaWorkValidator,
	recoveryKey: v.string(),
	reviewFingerprint: v.string(),
	targetIntentId: v.string(),
	targetCreatorId: v.string(),
	storageId: v.string(),
	reason: v.string(),
});
export const claim = internalMutation({
	args: {
		...confirmationArgs,
		leaseId: v.string(),
		sourceManifestJson: v.string(),
	},
	returns: workValidator,
	handler: async (ctx, args) => {
		const c = await owned(ctx, args, true);
		if (
			hash(
				contentPromotionManifestSchema.parse(
					JSON.parse(args.sourceManifestJson),
				),
			) !== hash(JSON.parse(c.work.manifestJson))
		)
			throw new Error("MEDIA_SOURCE_CHANGED");
		if (c.transfer.leaseExpiresAt > Date.now())
			throw new Error("MEDIA_RECOVERY_BUSY");
		if (
			c.row.status === "prepared" &&
			recoveryEvidenceHash(transferEvidence(c.transfer)) !== c.row.evidenceHash
		)
			throw new Error("MEDIA_RECOVERY_EVIDENCE_CHANGED");
		if (
			(c.transfer.dispatchCount !== 1 &&
				!(
					c.transfer.dispatchCount === 0 &&
					c.transfer.phase === "verified" &&
					c.transfer.storageId === c.row.storageId
				)) ||
			!c.transfer.targetIntentId
		)
			throw new Error("MEDIA_RECOVERY_EXISTING_BYTES_REQUIRED");
		const leaseExpiresAt = Date.now() + 120_000;
		await ctx.db.patch(c.transfer._id, {
			leaseId: args.leaseId,
			leaseExpiresAt,
			attempt: c.transfer.attempt + 1,
			updatedAt: Date.now(),
		});
		await ctx.db.patch(c.row._id, {
			status: c.row.status === "verified" ? "verified" : "granting",
			leaseId: args.leaseId,
			leaseExpiresAt,
			updatedAt: Date.now(),
		});
		if (c.row.status === "prepared")
			await ctx.db.insert("overseer_contentPromotionMediaRecoveryAudit", {
				recoveryId: c.row._id,
				actorId: c.row.operatorId,
				event: "confirmed",
				createdAt: Date.now(),
			});
		return {
			work: c.work,
			recoveryKey: c.row.recoveryKey,
			reviewFingerprint: c.row.reviewFingerprint,
			targetIntentId: c.row.targetIntentId,
			targetCreatorId: c.row.targetCreatorId,
			storageId: c.row.storageId,
			reason: c.row.reason,
		};
	},
});
export const work = internalQuery({
	args: confirmationArgs,
	returns: workValidator,
	handler: async (ctx, args) => {
		const c = await owned(ctx, args, true);
		return {
			work: c.work,
			recoveryKey: c.row.recoveryKey,
			reviewFingerprint: c.row.reviewFingerprint,
			targetIntentId: c.row.targetIntentId,
			targetCreatorId: c.row.targetCreatorId,
			storageId: c.row.storageId,
			reason: c.row.reason,
		};
	},
});
export const finish = internalMutation({
	args: {
		...confirmationArgs,
		leaseId: v.string(),
		targetGrantId: v.string(),
		targetGrantFingerprint: v.string(),
		targetBeneficiaryId: v.string(),
	},
	returns: recoverySummaryValidator,
	handler: async (ctx, args) => {
		const c = await owned(ctx, args);
		if (
			c.row.authorityHash !== c.pair.authorityHash ||
			c.row.leaseId !== args.leaseId ||
			c.transfer.leaseId !== args.leaseId ||
			c.transfer.leaseExpiresAt <= Date.now()
		)
			throw new Error("MEDIA_RECOVERY_LEASE_CHANGED");
		if (
			!/^[A-Za-z0-9_-]{1,200}$/.test(args.targetGrantId) ||
			!args.targetBeneficiaryId ||
			args.targetBeneficiaryId.length > 200 ||
			!/^[a-f0-9]{64}$/.test(args.targetGrantFingerprint) ||
			(c.row.targetGrantId && c.row.targetGrantId !== args.targetGrantId) ||
			(c.row.targetGrantFingerprint &&
				c.row.targetGrantFingerprint !== args.targetGrantFingerprint) ||
			(c.row.targetBeneficiaryId &&
				c.row.targetBeneficiaryId !== args.targetBeneficiaryId)
		)
			throw new Error("MEDIA_RECOVERY_ACK_CHANGED");
		await ctx.db.patch(c.transfer._id, {
			phase: "verified",
			storageId: c.row.storageId,
			leaseExpiresAt: 0,
			failureCode: undefined,
			updatedAt: Date.now(),
		});
		const patch = {
			status: "verified" as const,
			targetGrantId: args.targetGrantId,
			targetGrantFingerprint: args.targetGrantFingerprint,
			targetBeneficiaryId: args.targetBeneficiaryId,
			leaseExpiresAt: 0,
			updatedAt: Date.now(),
		};
		await ctx.db.patch(c.row._id, patch);
		if (c.row.status !== "verified")
			await ctx.db.insert("overseer_contentPromotionMediaRecoveryAudit", {
				recoveryId: c.row._id,
				actorId: c.row.operatorId,
				event: "reconciled",
				createdAt: Date.now(),
			});
		return summary({ ...c.row, ...patch });
	},
});
export const release = internalMutation({
	args: { ...confirmationArgs, leaseId: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const c = await owned(ctx, args);
		if (c.row.leaseId === args.leaseId && c.transfer.leaseId === args.leaseId) {
			await ctx.db.patch(c.transfer._id, { leaseExpiresAt: 0 });
			await ctx.db.patch(c.row._id, { leaseExpiresAt: 0 });
		}
		return null;
	},
});
