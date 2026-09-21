import { mediaReadiness } from "./mediaReadiness";
import { promotionReviewedRecords, promotionSyncedReviewDataSchema } from '@convexpress/site-contract/content-promotion';
import { applySummary, reviewedEnvelope, terminal } from "./applyPolicy";
import {
	beginResultValidator,
	targetValidator,
	reviewResultValidator,
	type PublicReview,
} from "./validators";
import { v } from "convex/values";
import {
	internalMutation,
	internalQuery,
	query,
	type QueryCtx,
	type MutationCtx,
} from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { requireAuth } from "../helpers/auth";
import { assertStoredAccess } from "../rbac/functions";
import {
	contentPromotionManifestSchema,
	promotionDataSchemas,
	promotionIdentitySchema,
} from "@convexpress/site-contract/content-promotion";
import {
	assertPromotionIdentity,
	assertPair,
	hash,
	reviewFingerprint,
	requestSchema,
	siteReviewSchema,
	REVIEW_TTL_MS,
	SAFE_FAILURE_CODES,
	type BrokerTarget,
} from "./policy";

type Context = QueryCtx | MutationCtx;
export async function preparePair(
	ctx: Context,
	sourceConnectionId: Id<"overseer_connections">,
	targetConnectionId: Id<"overseer_connections">,
) {
	const operator = await requireAuth(ctx);
	async function target(
		connectionId: Id<"overseer_connections">,
	): Promise<BrokerTarget> {
		const connection = await ctx.db.get(connectionId);
		if (
			!connection?.isActive ||
			connection.status !== "connected" ||
			!connection.credentials ||
			!connection.instance_id ||
			!connection.website_id
		)
			throw new Error("Connected environment not found");
		const instance = await ctx.db.get(connection.instance_id);
		const website = instance ? await ctx.db.get(instance.website_id) : null;
		if (
			!instance ||
			instance.status !== "active" ||
			!website ||
			website.status !== "active" ||
			website.engine !== "convexpress" ||
			!website.organization_id ||
			!website.business_id ||
			connection.website_id !== website._id ||
			connection.organization_id !== website.organization_id ||
			connection.business_id !== website.business_id ||
			instance.organization_id !== website.organization_id ||
			instance.business_id !== website.business_id ||
			(instance.connection_id && instance.connection_id !== connectionId)
		)
			throw new Error("Connection identity is inconsistent");
		const scope = {
			organizationId: String(website.organization_id),
			businessId: String(website.business_id),
			websiteId: String(website._id),
			instanceId: String(instance._id),
		};
		for (const code of [
			"site.read",
			"site.promote",
			"site.administer",
			...(instance.kind === "live" ? ["environment.live.operate"] : []),
		])
			await assertStoredAccess(ctx, operator, {
				selector: { type: "capability", code },
				target: scope,
			});
		assertPromotionIdentity(instance);
		const identity = {
			websiteKey: website.websiteKey,
			instanceKey: instance.instanceKey,
			deploymentOrigin: instance.deploymentOrigin,
			siteOrigin: instance.siteOrigin,
			environmentKind: instance.kind,
			schemaVersion: instance.schemaVersion!,
		};
		return {
			connectionId,
			instanceId: instance._id,
			websiteId: website._id,
			identity,
			authorityHash: hash({
				identity,
				scope,
				managementOrigin: instance.managementOrigin,
				siteContractVersion: instance.siteContractVersion,
				credentials: connection.credentials,
			}),
		};
	}
	const source = await target(sourceConnectionId),
		destination = await target(targetConnectionId);
	assertPair(source, destination);
	return {
		operatorId: operator._id,
		source,
		target: destination,
		authorityHash: hash([source.authorityHash, destination.authorityHash]),
	};
}
export const catalogPair = internalQuery({
	args: { sourceConnectionId: v.id("overseer_connections"), targetConnectionId: v.id("overseer_connections") },
	returns: v.object({ source: targetValidator, target: targetValidator, authorityHash: v.string() }),
	handler: async (ctx, args): Promise<{source: BrokerTarget; target: BrokerTarget; authorityHash: string}> => {
		const {source, target, authorityHash} = await preparePair(ctx, args.sourceConnectionId, args.targetConnectionId);
		return {source, target, authorityHash};
	},
});
export const begin = internalMutation({
	args: {
		sourceConnectionId: v.id("overseer_connections"),
		targetConnectionId: v.id("overseer_connections"),
		requestJson: v.string(),
	},
	returns: beginResultValidator,
	handler: async (ctx, args) => {
		if (new TextEncoder().encode(args.requestJson).length > 100_000)
			throw new Error("Review request is too large");
		const request = requestSchema.parse(JSON.parse(args.requestJson));
		const pair = await preparePair(
			ctx,
			args.sourceConnectionId,
			args.targetConnectionId,
		);
		const requestHash = hash({
			sourceConnectionId: args.sourceConnectionId,
			targetConnectionId: args.targetConnectionId,
			request,
		});
		const existing = await ctx.db
			.query("overseer_contentPromotionReviews")
			.withIndex("by_operator_request", (q) =>
				q
					.eq("operatorId", pair.operatorId)
					.eq("requestKey", request.requestKey),
			)
			.unique();
		if (existing) {
			if (existing.requestHash !== requestHash)
				throw new Error("Request key was used for a different review");
			if (
				existing.authorityHash !== pair.authorityHash ||
				existing.expiresAt <= Date.now()
			)
				throw new Error(
					"Review identity changed or expired; use a new request key",
				);
			return {
				receiptId: existing._id,
				execute: false,
				source: pair.source,
				target: pair.target,
			};
		}
		const now = Date.now();
		const receiptId = await ctx.db.insert("overseer_contentPromotionReviews", {
			operatorId: pair.operatorId,
			requestKey: request.requestKey,
			requestHash,
			sourceConnectionId: args.sourceConnectionId,
			targetConnectionId: args.targetConnectionId,
			websiteId: ctx.db.normalizeId(
				"overseer_websites",
				pair.source.websiteId,
			)!,
			sourceInstanceId: ctx.db.normalizeId(
				"overseer_websiteInstances",
				pair.source.instanceId,
			)!,
			targetInstanceId: ctx.db.normalizeId(
				"overseer_websiteInstances",
				pair.target.instanceId,
			)!,
			authorityHash: pair.authorityHash,
			identitiesJson: JSON.stringify({
				source: pair.source.identity,
				target: pair.target.identity,
			}),
			requestJson: JSON.stringify(request),
			status: "reviewing",
			createdAt: now,
			updatedAt: now,
			expiresAt: now + REVIEW_TTL_MS,
		});
		return {
			receiptId,
			execute: true,
			source: pair.source,
			target: pair.target,
		};
	},
});
export const finish = internalMutation({
	args: {
		receiptId: v.id("overseer_contentPromotionReviews"),
		manifestJson: v.string(),
		reviewJson: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (
			new TextEncoder().encode(args.manifestJson).length > 500_000 ||
			new TextEncoder().encode(args.reviewJson).length > 250_000
		)
			throw new Error("Review result exceeds its bound");
		const receipt = await ctx.db.get(args.receiptId);
		if (!receipt) throw new Error("Review not found");
		const pair = await preparePair(
			ctx,
			receipt.sourceConnectionId,
			receipt.targetConnectionId,
		);
		if (
			receipt.operatorId !== pair.operatorId ||
			receipt.status !== "reviewing" ||
			receipt.expiresAt <= Date.now() ||
			receipt.authorityHash !== pair.authorityHash
		)
			throw new Error("Review authority changed or expired");
		const manifest = contentPromotionManifestSchema.parse(
			JSON.parse(args.manifestJson),
		);
		const review = siteReviewSchema.parse(JSON.parse(args.reviewJson));
		if (
			hash(manifest.source) !== hash(pair.source.identity) ||
			hash(manifest.target) !== hash(pair.target.identity)
		)
			throw new Error("Manifest identity mismatch");
		const request = requestSchema.parse(JSON.parse(receipt.requestJson));
		if (hash(manifest.selection) !== hash(request.selection))
			throw new Error("Export selection mismatch");
		const resolvedMedia = mediaReadiness(manifest, request, review);
    const authored = promotionReviewedRecords(manifest);
		if (
			review.ready &&
			(!review.receiptId ||
				review.issues.length ||
				manifest.issues.length ||
				review.changes.length !== authored.length ||
				!resolvedMedia.ready)
		)
			throw new Error("Site review readiness is inconsistent");
		const keys = new Set(authored.map((r) => r.key));
		if (
			review.changes.some(
				(c) =>
					!keys.has(c.key) ||
					authored.find((r) => r.key === c.key)?.kind !== c.kind ||
					c.fields.some(
						(field) =>
							!Object.prototype.hasOwnProperty.call(
								c.kind === 'syncedBlock' ? promotionSyncedReviewDataSchema.shape : promotionDataSchemas[c.kind].shape,
								field,
							),
					),
			) ||
			new Set(review.changes.map((c) => c.key)).size !== review.changes.length
		)
			throw new Error("Site review changed an unselected record");
		await ctx.db.patch(receipt._id, {
			status: review.ready ? "reviewed" : "blocked",
			manifestHash: hash(manifest),
			manifestJson: JSON.stringify(manifest),
			sourceRevisionHash: hash(
				manifest.records.map((r) => [r.key, r.sourceRevision]),
			),
			reviewJson: JSON.stringify(review),
			siteReceiptId: review.receiptId ?? undefined,
			siteDigest: review.digest,
			updatedAt: Date.now(),
		});
		return null;
	},
});
export const failReview = internalMutation({
	args: {
		receiptId: v.id("overseer_contentPromotionReviews"),
		failureCode: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const operator = await requireAuth(ctx);
		const receipt = await ctx.db.get(args.receiptId);
		if (!receipt || receipt.operatorId !== operator._id)
			throw new Error("Review not found");
		if (receipt.status === "reviewing")
			await ctx.db.patch(receipt._id, {
				status: "failed",
				failureCode: SAFE_FAILURE_CODES.has(args.failureCode)
					? args.failureCode
					: "SITE_REVIEW_FAILED",
				updatedAt: Date.now(),
			});
		return null;
	},
});
export function publicReceipt(
	receipt: Doc<"overseer_contentPromotionReviews">,
): PublicReview {
	if (
		(receipt.manifestJson &&
			new TextEncoder().encode(receipt.manifestJson).length > 500_000) ||
		(receipt.reviewJson &&
			new TextEncoder().encode(receipt.reviewJson).length > 250_000)
	)
		throw new Error("Stored review exceeds its bound");
	const review = receipt.reviewJson
		? siteReviewSchema.parse(JSON.parse(receipt.reviewJson))
		: null;
	const manifest = receipt.manifestJson
		? contentPromotionManifestSchema.parse(JSON.parse(receipt.manifestJson))
		: null;
	const request = requestSchema.parse(JSON.parse(receipt.requestJson));
	const identities = JSON.parse(receipt.identitiesJson);
	const sourceIdentity = promotionIdentitySchema.parse(identities.source);
	const targetIdentity = promotionIdentitySchema.parse(identities.target);
	const media = manifest?.records.filter((r) => r.kind === "media") ?? [];
	const resolvedMedia =
		manifest && review
			? mediaReadiness(manifest, request, review)
			: { provided: 0, ready: false };
	return {
		reviewFingerprint: reviewFingerprint(receipt),
		sourceIdentity,
		targetIdentity,
		receiptId: receipt._id,
		status: receipt.expiresAt <= Date.now() ? "expired" : receipt.status,
		canApply: false,
		canRecover: false,
		applyState: null,
		reviewReady:
			receipt.expiresAt > Date.now() && receipt.status === "reviewed",
		requestHash: receipt.requestHash,
		authorityHash: receipt.authorityHash,
		manifestHash: receipt.manifestHash ?? null,
		sourceRevisionHash: receipt.sourceRevisionHash ?? null,
		sourceConnectionId: receipt.sourceConnectionId,
		targetConnectionId: receipt.targetConnectionId,
		recordCount: manifest ? promotionReviewedRecords(manifest).length : 0,
		authoredRecords: (manifest ? promotionReviewedRecords(manifest) : []).map(({ data, ...record }) => ({
			...record,
			dataJson: JSON.stringify(data),
		})),
		mediaRequired: media.length,
		mediaProvided: resolvedMedia.provided,
		mediaReady: receipt.expiresAt > Date.now() && resolvedMedia.ready,
		issues: review?.issues ?? [],
		changes: review?.changes ?? [],
		failureCode: receipt.failureCode ?? null,
		createdAt: receipt.createdAt,
		expiresAt: receipt.expiresAt,
	};
}
export const get = query({
	args: { receiptId: v.id("overseer_contentPromotionReviews") },
	returns: reviewResultValidator,
	handler: async (ctx, args) => {
		const receipt = await ctx.db.get(args.receiptId);
		if (!receipt) throw new Error("Review not found");
		const pair = await preparePair(
			ctx,
			receipt.sourceConnectionId,
			receipt.targetConnectionId,
		);
		if (pair.operatorId !== receipt.operatorId)
			throw new Error("Review not found");
		const result = publicReceipt(receipt);
		const row = await ctx.db
			.query("overseer_contentPromotionApplies")
			.withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
			.unique();
		if (
			row &&
			(row.operatorId !== pair.operatorId ||
				row.reviewFingerprint !== result.reviewFingerprint)
		)
			throw new Error("Apply identity differs from the reviewed receipt");
		const applyState = row ? applySummary(row) : null;
		const sameAuthority = pair.authorityHash === receipt.authorityHash;
		const sameIdentity =
			hash(pair.source.identity) === hash(result.sourceIdentity) &&
			hash(pair.target.identity) === hash(result.targetIdentity);
		if (result.reviewReady) reviewedEnvelope(receipt);
		const canRecover =
			!!row &&
			sameIdentity &&
			!terminal(row.status) &&
			row.leaseExpiresAt <= Date.now() &&
			(row.dispatchCount > 0 ||
				(sameAuthority && receipt.expiresAt > Date.now()));
		return {
			...result,
			applyState,
			canRecover,
			canApply:
				sameAuthority &&
				sameIdentity &&
				result.reviewReady &&
				result.mediaReady &&
				result.recordCount > 0 &&
				!row,
			reviewReady: sameAuthority && result.reviewReady && !row,
			...(!sameAuthority
				? { status: "conflict" as const, mediaReady: false }
				: {}),
		};
	},
});
