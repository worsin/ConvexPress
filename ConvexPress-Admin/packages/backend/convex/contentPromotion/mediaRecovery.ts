import { v } from "convex/values";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import {
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
	mediaUploadArgs,
	authorize,
	allowedSize,
	verify,
	summary,
	type Args,
	type MediaUploadResult,
} from "./mediaUploads";
import { hash, fail } from "./shared";

const result = v.object({
	intentId: v.id("contentPromotion_mediaUploads"),
	transferKey: v.string(),
	status: v.union(v.literal("issued"), v.literal("verified")),
	storageId: v.union(v.id("_storage"), v.null()),
	sha256: v.string(),
	fileSize: v.number(),
	mimeType: v.string(),
});
const grantResult = v.object({
	grantId: v.id("contentPromotion_mediaRecoveryGrants"),
	recoveryKey: v.string(),
	fingerprint: v.string(),
	creatorId: v.id("users"),
	beneficiaryId: v.id("users"),
	intentId: v.id("contentPromotion_mediaUploads"),
	storageId: v.id("_storage"),
	reviewFingerprint: v.string(),
	result,
});
type GrantResult = {
	grantId: Id<"contentPromotion_mediaRecoveryGrants">;
	recoveryKey: string;
	fingerprint: string;
	creatorId: Id<"users">;
	beneficiaryId: Id<"users">;
	intentId: Id<"contentPromotion_mediaUploads">;
	storageId: Id<"_storage">;
	reviewFingerprint: string;
	result: MediaUploadResult;
};
async function scoped(ctx: QueryCtx | MutationCtx, args: Args) {
	const auth = await authorize(ctx, args);
	const row = await ctx.db
		.query("contentPromotion_mediaUploads")
		.withIndex("by_transfer_key", (q) => q.eq("transferKey", auth.key))
		.unique();
	if (
		!row ||
		row.sourceIdentityJson !== JSON.stringify(auth.source) ||
		row.targetIdentityJson !== JSON.stringify(auth.target) ||
		row.sha256 !== auth.media.sha256 ||
		row.fileSize !== auth.media.fileSize ||
		row.mimeType !== auth.media.mimeType
	)
		fail(
			"PROMOTION_MEDIA_INVALID",
			"Existing transfer is unavailable in this scope.",
		);
	return { auth, row };
}
function dto(
	grant: Doc<"contentPromotion_mediaRecoveryGrants">,
	row: Doc<"contentPromotion_mediaUploads">,
): GrantResult {
	return {
		grantId: grant._id,
		recoveryKey: grant.recoveryKey,
		fingerprint: grant.fingerprint,
		creatorId: grant.creatorId,
		beneficiaryId: grant.beneficiaryId,
		intentId: grant.intentId,
		storageId: grant.storageId,
		reviewFingerprint: grant.reviewFingerprint,
		result: summary(row),
	};
}
async function checkedGrant(
	ctx: QueryCtx | MutationCtx,
	args: Args,
	grant: Doc<"contentPromotion_mediaRecoveryGrants">,
) {
	const { auth, row } = await scoped(ctx, args);
	if (
		grant.beneficiaryId !== auth.user._id ||
		grant.intentId !== row._id ||
		grant.transferKey !== row.transferKey ||
		grant.creatorId !== row.operatorId ||
		(row.storageId && row.storageId !== grant.storageId)
	)
		fail(
			"PROMOTION_MEDIA_INVALID",
			"Recovery grant does not match this operator and transfer.",
		);
	await verify(ctx, row, grant.storageId);
	return row;
}
/** Privileged exact-identity metadata inspection; no listing or upload capability. */
export const inspect: RegisteredQuery<
	"public",
	Args,
	{ creatorId: Id<"users">; result: MediaUploadResult }
> = query({
	args: mediaUploadArgs,
	returns: v.object({ creatorId: v.id("users"), result }),
	handler: async (ctx: QueryCtx, args: Args) => {
		const { row } = await scoped(ctx, args);
		if (row.storageId) await verify(ctx, row, row.storageId);
		return { creatorId: row.operatorId, result: summary(row) };
	},
});
type GrantArgs = Args & {
	recoveryKey: string;
	reviewFingerprint: string;
	intentId: Id<"contentPromotion_mediaUploads">;
	storageId: Id<"_storage">;
	reason: string;
};
/** The broker resolves storage from its durable ledger or exact target evidence; actual bytes are always verified here. */
export const grant: RegisteredMutation<"public", GrantArgs, GrantResult> =
	mutation({
		args: {
			...mediaUploadArgs,
			recoveryKey: v.string(),
			reviewFingerprint: v.string(),
			intentId: v.id("contentPromotion_mediaUploads"),
			storageId: v.id("_storage"),
			reason: v.string(),
		},
		returns: grantResult,
		handler: async (ctx: MutationCtx, args: GrantArgs) => {
			if (
				!/^[a-f0-9]{64}$/.test(args.recoveryKey) ||
				!/^[a-f0-9]{64}$/.test(args.reviewFingerprint) ||
				args.reason.trim().length < 1 ||
				args.reason.length > 500
			)
				fail("PROMOTION_MEDIA_INVALID", "Invalid recovery confirmation.");
			const { auth, row } = await scoped(ctx, args);
			if (
				row._id !== args.intentId ||
				(row.storageId && row.storageId !== args.storageId)
			)
				fail("PROMOTION_MEDIA_INVALID", "Recovery storage binding changed.");
			if (row.status !== "verified") await allowedSize(ctx, row.fileSize);
			await verify(ctx, row, args.storageId);
			const fingerprint = hash({
				recoveryKey: args.recoveryKey,
				reviewFingerprint: args.reviewFingerprint,
				transferKey: row.transferKey,
				intentId: row._id,
				storageId: args.storageId,
				creatorId: row.operatorId,
				beneficiaryId: auth.user._id,
				reason: args.reason,
			});
			const existing = await ctx.db
				.query("contentPromotion_mediaRecoveryGrants")
				.withIndex("by_recovery_key", (q) =>
					q.eq("recoveryKey", args.recoveryKey),
				)
				.unique();
			if (existing) {
				if (existing.fingerprint !== fingerprint)
					fail("PROMOTION_MEDIA_INVALID", "Recovery confirmation changed.");
				await checkedGrant(ctx, args, existing);
				return dto(existing, row);
			}
			const id = await ctx.db.insert("contentPromotion_mediaRecoveryGrants", {
				recoveryKey: args.recoveryKey,
				reviewFingerprint: args.reviewFingerprint,
				transferKey: row.transferKey,
				intentId: row._id,
				storageId: args.storageId,
				creatorId: row.operatorId,
				beneficiaryId: auth.user._id,
				reason: args.reason,
				fingerprint,
				createdAt: Date.now(),
			});
			await ctx.db.insert("contentPromotion_mediaRecoveryAudit", {
				grantId: id,
				event: "granted",
				actorId: auth.user._id,
				createdAt: Date.now(),
			});
			return dto((await ctx.db.get(id))!, row);
		},
	});
export const status: RegisteredQuery<
	"public",
	Args & { recoveryKey: string },
	GrantResult | null
> = query({
	args: { ...mediaUploadArgs, recoveryKey: v.string() },
	returns: v.union(grantResult, v.null()),
	handler: async (ctx: QueryCtx, args: Args & { recoveryKey: string }) => {
		await scoped(ctx, args);
		const grant = await ctx.db
			.query("contentPromotion_mediaRecoveryGrants")
			.withIndex("by_recovery_key", (q) =>
				q.eq("recoveryKey", args.recoveryKey),
			)
			.unique();
		if (!grant) return null;
		return dto(grant, await checkedGrant(ctx, args, grant));
	},
});
export const complete: RegisteredMutation<
	"public",
	Args & { grantId: Id<"contentPromotion_mediaRecoveryGrants"> },
	GrantResult
> = mutation({
	args: {
		...mediaUploadArgs,
		grantId: v.id("contentPromotion_mediaRecoveryGrants"),
	},
	returns: grantResult,
	handler: async (
		ctx: MutationCtx,
		args: Args & { grantId: Id<"contentPromotion_mediaRecoveryGrants"> },
	) => {
		const grant = await ctx.db.get(args.grantId);
		if (!grant) fail("PROMOTION_MEDIA_INVALID", "Recovery grant unavailable.");
		const row = await checkedGrant(ctx, args, grant);
		if (row.status !== "verified") {
			await allowedSize(ctx, row.fileSize);
			await ctx.db.patch("contentPromotion_mediaUploads", row._id, {
				status: "verified",
				storageId: grant.storageId,
				updatedAt: Date.now(),
			});
			await ctx.db.insert("contentPromotion_mediaRecoveryAudit", {
				grantId: grant._id,
				event: "reconciled",
				actorId: grant.beneficiaryId,
				createdAt: Date.now(),
			});
		}
		return dto(grant, {
			...row,
			status: "verified",
			storageId: grant.storageId,
		});
	},
});
