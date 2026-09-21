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
	contentPromotionManifestSchema,
	promotionDataSchemas,
} from "@convexpress/site-contract/content-promotion";
import {
	promotionMediaSpecSchema,
	promotionMediaTransferKey,
} from "@convexpress/site-contract";
import { preparePair } from "./records";
import { hash, requestSchema, reviewFingerprint } from "./policy";
import { targetValidator } from "./validators";
import { validateMediaBatch } from "./mediaTransferProtocol";
export const mediaConfirmationArgs = {
	receiptId: v.id("overseer_contentPromotionReviews"),
	expectedReviewFingerprint: v.string(),
	mediaKey: v.string(),
};
export type MediaConfirmation = {
	receiptId: Id<"overseer_contentPromotionReviews">;
	expectedReviewFingerprint: string;
	mediaKey: string;
};
const specValidator = v.object({
	sha256: v.string(),
	fileSize: v.number(),
	mimeType: v.union(
		v.literal("image/png"),
		v.literal("image/jpeg"),
		v.literal("image/webp"),
	),
});
export const mediaSummaryValidator = v.object({
	transferKey: v.string(),
	phase: v.union(
		v.literal("planned"),
		v.literal("uploading"),
		v.literal("uploaded"),
		v.literal("verified"),
		v.literal("uncertain"),
	),
	dispatchCount: v.number(),
	storageId: v.union(v.string(), v.null()),
	failureCode: v.union(v.string(), v.null()),
	retryAfter: v.union(v.number(), v.null()),
	possibleOrphan: v.boolean(),
});
export type MediaSummary = Infer<typeof mediaSummaryValidator>;
export const mediaWorkValidator = v.object({
	source: targetValidator,
	target: targetValidator,
	manifestJson: v.string(),
	requestJson: v.string(),
	transferKey: v.string(),
	media: specValidator,
});
export type MediaWork = Infer<typeof mediaWorkValidator>;
function summary(row: Doc<"overseer_contentPromotionMedia">): MediaSummary {
	return {
		transferKey: row.transferKey,
		phase:
			row.phase === "uploading" && row.leaseExpiresAt <= Date.now()
				? "uncertain"
				: row.phase,
		dispatchCount: row.dispatchCount,
		storageId: row.phase === "verified" ? (row.storageId ?? null) : null,
		failureCode: row.failureCode ?? null,
		retryAfter: row.leaseExpiresAt > Date.now() ? row.leaseExpiresAt : null,
		possibleOrphan: row.dispatchCount > 0 && !row.storageId,
	};
}
export async function loadMediaContext(
	ctx: QueryCtx | MutationCtx,
	args: MediaConfirmation,
	fresh = false,
) {
	const receipt = await ctx.db.get(args.receiptId);
	if (
		!receipt ||
		reviewFingerprint(receipt) !== args.expectedReviewFingerprint ||
		!receipt.manifestJson ||
		!["reviewed", "blocked"].includes(receipt.status) ||
		receipt.manifestJson.length > 500_000
	)
		throw new Error("MEDIA_REVIEW_INVALID");
	const pair = await preparePair(
		ctx,
		receipt.sourceConnectionId,
		receipt.targetConnectionId,
	);
	if (pair.operatorId !== receipt.operatorId)
		throw new Error("MEDIA_REVIEW_INVALID");
	const manifest = contentPromotionManifestSchema.parse(
		JSON.parse(receipt.manifestJson),
	);
	const request = requestSchema.parse(JSON.parse(receipt.requestJson));
	if (
		hash({
			sourceConnectionId: receipt.sourceConnectionId,
			targetConnectionId: receipt.targetConnectionId,
			request,
		}) !== receipt.requestHash ||
		hash(manifest) !== receipt.manifestHash ||
		hash(
			manifest.records.map((record) => [record.key, record.sourceRevision]),
		) !== receipt.sourceRevisionHash ||
		hash(manifest.selection) !== hash(request.selection) ||
		hash(pair.source.identity) !== hash(manifest.source) ||
		hash(pair.target.identity) !== hash(manifest.target)
	)
		throw new Error("MEDIA_REVIEW_INVALID");
	if (
		fresh &&
		(receipt.expiresAt <= Date.now() ||
			pair.authorityHash !== receipt.authorityHash)
	)
		throw new Error("MEDIA_REVIEW_EXPIRED_OR_CHANGED");
	const files = manifest.records
		.filter((record) => record.kind === "media")
		.map((record) => ({
			...record,
			data: promotionDataSchemas.media.parse(record.data),
		}));
	validateMediaBatch(
		files.map((record) => ({ key: record.key, ...record.data })),
	);
	const file = files.find((record) => record.key === args.mediaKey);
	if (!file) throw new Error("MEDIA_NOT_REVIEWED");
	const media = promotionMediaSpecSchema.parse({
		sha256: file.data.sha256,
		fileSize: file.data.fileSize,
		mimeType: file.data.mimeType,
	});
	const transferKey = promotionMediaTransferKey(
		manifest.source,
		manifest.target,
		media,
	);
	const work: MediaWork = {
		source: pair.source,
		target: pair.target,
		manifestJson: receipt.manifestJson,
		requestJson: receipt.requestJson,
		media,
		transferKey,
	};
	return { receipt, pair, work };
}
function owned(
	row: Doc<"overseer_contentPromotionMedia">,
	context: Awaited<ReturnType<typeof loadMediaContext>>,
) {
	if (
		row.operatorId !== context.pair.operatorId ||
		row.transferKey !== context.work.transferKey ||
		row.sourceIdentityJson !== JSON.stringify(context.work.source.identity) ||
		row.targetIdentityJson !== JSON.stringify(context.work.target.identity) ||
		row.mimeType !== context.work.media.mimeType ||
		row.sha256 !== context.work.media.sha256 ||
		row.fileSize !== context.work.media.fileSize
	)
		throw new Error("MEDIA_TRANSFER_SCOPE_CHANGED");
}
export const inspect = internalQuery({
	args: mediaConfirmationArgs,
	returns: mediaWorkValidator,
	handler: async (ctx, args) => (await loadMediaContext(ctx, args)).work,
});
export const get = query({
	args: mediaConfirmationArgs,
	returns: v.union(mediaSummaryValidator, v.null()),
	handler: async (ctx, args) => {
		const context = await loadMediaContext(ctx, args);
		const row = await ctx.db
			.query("overseer_contentPromotionMedia")
			.withIndex("by_transfer_key", (q) =>
				q.eq("transferKey", context.work.transferKey),
			)
			.unique();
		if (!row) return null;
		if (row.operatorId !== context.pair.operatorId) {
			const recovery = await ctx.db
				.query("overseer_contentPromotionMediaRecoveries")
				.withIndex("by_review_transfer", (q) =>
					q.eq("receiptId", args.receiptId).eq("transferKey", row.transferKey),
				)
				.unique();
			if (
				!recovery ||
				recovery.operatorId !== context.pair.operatorId ||
				recovery.reviewFingerprint !== args.expectedReviewFingerprint ||
				recovery.status !== "verified" ||
				recovery.creatorId !== row.operatorId ||
				recovery.transferId !== row._id ||
				recovery.storageId !== row.storageId ||
				recovery.targetIntentId !== row.targetIntentId ||
				!recovery.targetGrantId ||
				row.phase !== "verified"
			)
				throw new Error("MEDIA_TRANSFER_SCOPE_CHANGED");
		} else owned(row, context);
		return summary(row);
	},
});
export const claim = internalMutation({
	args: { ...mediaConfirmationArgs, leaseId: v.string() },
	returns: v.object({
		transferId: v.id("overseer_contentPromotionMedia"),
		work: v.union(mediaWorkValidator, v.null()),
		storageId: v.union(v.string(), v.null()),
		targetIntentId: v.union(v.string(), v.null()),
		dispatchCount: v.number(),
	}),
	handler: async (ctx, args) => {
		const context = await loadMediaContext(ctx, args);
		let row = await ctx.db
			.query("overseer_contentPromotionMedia")
			.withIndex("by_transfer_key", (q) =>
				q.eq("transferKey", context.work.transferKey),
			)
			.unique();
		if (row) owned(row, context);
		if (row && row.leaseExpiresAt > Date.now())
			return {
				transferId: row._id,
				work: null,
				storageId: row.storageId ?? null,
				targetIntentId: row.targetIntentId ?? null,
				dispatchCount: row.dispatchCount,
			};
		if (!row || (row.dispatchCount === 0 && !row.storageId))
			await loadMediaContext(ctx, args, true);
		if (!row) {
			const id = await ctx.db.insert("overseer_contentPromotionMedia", {
				transferKey: context.work.transferKey,
				receiptId: args.receiptId,
				operatorId: context.pair.operatorId,
				sourceIdentityJson: JSON.stringify(context.work.source.identity),
				targetIdentityJson: JSON.stringify(context.work.target.identity),
				...context.work.media,
				phase: "planned",
				leaseId: args.leaseId,
				leaseExpiresAt: Date.now() + 120_000,
				attempt: 1,
				dispatchCount: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			row = (await ctx.db.get(id))!;
		} else {
			await ctx.db.patch(row._id, {
				receiptId: args.receiptId,
				leaseId: args.leaseId,
				leaseExpiresAt: Date.now() + 120_000,
				attempt: row.attempt + 1,
				updatedAt: Date.now(),
			});
		}
		return {
			transferId: row._id,
			work: context.work,
			storageId: row.storageId ?? null,
			targetIntentId: row.targetIntentId ?? null,
			dispatchCount: row.dispatchCount,
		};
	},
});
const checkpointArgs = {
	...mediaConfirmationArgs,
	transferId: v.id("overseer_contentPromotionMedia"),
	leaseId: v.string(),
};
async function checkpoint(
	ctx: MutationCtx,
	args: MediaConfirmation & {
		transferId: Id<"overseer_contentPromotionMedia">;
		leaseId: string;
	},
	fresh = false,
) {
	const context = await loadMediaContext(ctx, args, fresh);
	const row = await ctx.db.get(args.transferId);
	if (!row) throw new Error("MEDIA_TRANSFER_MISSING");
	owned(row, context);
	if (row.leaseId !== args.leaseId || row.leaseExpiresAt <= Date.now())
		throw new Error("MEDIA_LEASE_CHANGED");
	return { row, context };
}
export const dispatch = internalMutation({
	args: {
		...checkpointArgs,
		targetIntentId: v.string(),
		sourceManifestJson: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { row, context } = await checkpoint(ctx, args, true);
		if (
			row.dispatchCount !== 0 ||
			row.storageId ||
			row.phase !== "planned" ||
			hash(
				contentPromotionManifestSchema.parse(
					JSON.parse(args.sourceManifestJson),
				),
			) !== hash(JSON.parse(context.work.manifestJson)) ||
			args.targetIntentId.length > 200 ||
			!args.targetIntentId
		)
			throw new Error("MEDIA_DISPATCH_REFUSED");
		await ctx.db.patch(row._id, {
			phase: "uploading",
			dispatchCount: 1,
			targetIntentId: args.targetIntentId,
			updatedAt: Date.now(),
		});
		return null;
	},
});
export const remember = internalMutation({
	args: { ...checkpointArgs, storageId: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { row } = await checkpoint(ctx, args);
		if (
			row.dispatchCount !== 1 ||
			!/^[A-Za-z0-9_-]{1,200}$/.test(args.storageId) ||
			(row.storageId && row.storageId !== args.storageId)
		)
			throw new Error("MEDIA_STORAGE_INVALID");
		await ctx.db.patch(row._id, {
			storageId: args.storageId,
			phase: "uploaded",
			updatedAt: Date.now(),
		});
		return null;
	},
});
export const finish = internalMutation({
	args: {
		...checkpointArgs,
		targetIntentId: v.string(),
		storageId: v.string(),
		sha256: v.string(),
		fileSize: v.number(),
		mimeType: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { row, context } = await checkpoint(ctx, args);
		const media = promotionMediaSpecSchema.parse({
			sha256: args.sha256,
			fileSize: args.fileSize,
			mimeType: args.mimeType,
		});
		if (
			hash(media) !== hash(context.work.media) ||
			!args.targetIntentId ||
			args.targetIntentId.length > 200 ||
			!/^[A-Za-z0-9_-]{1,200}$/.test(args.storageId) ||
			(row.targetIntentId && row.targetIntentId !== args.targetIntentId) ||
			(row.storageId && row.storageId !== args.storageId)
		)
			throw new Error("MEDIA_STORAGE_INVALID");
		await ctx.db.patch(row._id, {
			phase: "verified",
			storageId: args.storageId,
			targetIntentId: args.targetIntentId,
			leaseExpiresAt: 0,
			failureCode: undefined,
			updatedAt: Date.now(),
		});
		return null;
	},
});
export const fail = internalMutation({
	args: {
		...checkpointArgs,
		code: v.union(
			v.literal("MEDIA_CHECK_FAILED"),
			v.literal("MEDIA_UPLOAD_UNCERTAIN"),
			v.literal("MEDIA_COMPLETION_UNCERTAIN"),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { row } = await checkpoint(ctx, args);
		await ctx.db.patch(row._id, {
			phase: row.dispatchCount > 0 ? "uncertain" : "planned",
			failureCode: args.code,
			leaseExpiresAt: 0,
			updatedAt: Date.now(),
		});
		return null;
	},
});
