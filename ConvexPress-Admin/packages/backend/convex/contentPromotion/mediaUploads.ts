import { v, type Validator } from "convex/values";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import {
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { promotionIdentitySchema } from "@convexpress/site-contract/content-promotion";
import {
	promotionMediaSpecSchema,
	promotionMediaTransferKey,
	storageSha256Hex,
} from "@convexpress/site-contract";
import { getMediaSettings, MEDIA_SETTINGS_DEFAULTS } from "../media/helpers";
import { identity, hash, fail } from "./shared";
type UploadIdentity = {
	websiteKey: string;
	instanceKey: string;
	deploymentOrigin: string;
	siteOrigin: string;
	environmentKind: "staging" | "live";
	schemaVersion: string;
};
type UploadMedia = {
	sha256: string;
	fileSize: number;
	mimeType: "image/png" | "image/jpeg" | "image/webp";
};
const identityValidator: Validator<UploadIdentity, "required", string> =
	v.object({
		websiteKey: v.string(),
		instanceKey: v.string(),
		deploymentOrigin: v.string(),
		siteOrigin: v.string(),
		environmentKind: v.union(v.literal("staging"), v.literal("live")),
		schemaVersion: v.string(),
	});
const mediaValidator: Validator<UploadMedia, "required", string> = v.object({
	sha256: v.string(),
	fileSize: v.number(),
	mimeType: v.union(
		v.literal("image/png"),
		v.literal("image/jpeg"),
		v.literal("image/webp"),
	),
});
export const mediaUploadArgs: {
	[K in keyof Args]: Validator<Args[K], "required", string>;
} = {
	source: identityValidator,
	target: identityValidator,
	media: mediaValidator,
};
export type Args = {
	source: UploadIdentity;
	target: UploadIdentity;
	media: UploadMedia;
};
const resultValidator: Validator<MediaUploadResult, "required", string> =
	v.object({
		intentId: v.id("contentPromotion_mediaUploads"),
		transferKey: v.string(),
		status: v.union(v.literal("issued"), v.literal("verified")),
		storageId: v.union(v.id("_storage"), v.null()),
		sha256: v.string(),
		fileSize: v.number(),
		mimeType: v.string(),
	});
export async function authorize(ctx: QueryCtx | MutationCtx, args: Args) {
	const user = await requireCan(ctx, "manage_options");
	await requireCan(ctx, "media.upload");
	const source = promotionIdentitySchema.parse(args.source);
	const target = promotionIdentitySchema.parse(args.target);
	const media = promotionMediaSpecSchema.parse(args.media);
	if (hash(await identity(ctx)) !== hash(target))
		fail("PROMOTION_TARGET_MISMATCH", "The reviewed upload target changed.");
	return {
		user,
		source,
		target,
		media,
		key: promotionMediaTransferKey(source, target, media),
	};
}
function check(
	row: Doc<"contentPromotion_mediaUploads">,
	auth: Awaited<ReturnType<typeof authorize>>,
) {
	if (
		row.operatorId !== auth.user._id ||
		row.transferKey !== auth.key ||
		row.sourceIdentityJson !== JSON.stringify(auth.source) ||
		row.targetIdentityJson !== JSON.stringify(auth.target) ||
		row.sha256 !== auth.media.sha256 ||
		row.fileSize !== auth.media.fileSize ||
		row.mimeType !== auth.media.mimeType
	)
		fail(
			"PROMOTION_MEDIA_INVALID",
			"This upload intent does not match the authorized media transfer.",
		);
}
export async function verify(
	ctx: QueryCtx | MutationCtx,
	row: Doc<"contentPromotion_mediaUploads">,
	storageId: NonNullable<Doc<"contentPromotion_mediaUploads">["storageId"]>,
) {
	const storage = await ctx.db.system.get(storageId);
	if (
		!storage ||
		storageSha256Hex(storage.sha256) !== row.sha256 ||
		storage.size !== row.fileSize ||
		storage.contentType !== row.mimeType
	)
		fail(
			"PROMOTION_MEDIA_INVALID",
			"Target storage does not match the reviewed file.",
		);
}
export async function allowedSize(ctx: QueryCtx | MutationCtx, size: number) {
	const settings = await getMediaSettings(ctx);
	if (size > (settings.maxUploadSize || MEDIA_SETTINGS_DEFAULTS.maxUploadSize))
		fail(
			"PROMOTION_MEDIA_INVALID",
			"This file exceeds the target upload size policy.",
		);
}
export type MediaUploadResult = {
	intentId: Id<"contentPromotion_mediaUploads">;
	transferKey: string;
	status: "issued" | "verified";
	storageId: Id<"_storage"> | null;
	sha256: string;
	fileSize: number;
	mimeType: string;
};
export function summary(
	row: Doc<"contentPromotion_mediaUploads">,
): MediaUploadResult {
	return {
		intentId: row._id,
		transferKey: row.transferKey,
		status: row.status,
		storageId: row.storageId ?? null,
		sha256: row.sha256,
		fileSize: row.fileSize,
		mimeType: row.mimeType,
	};
}
export const begin: RegisteredMutation<
	"public",
	Args,
	{ result: MediaUploadResult; uploadUrl: string | null }
> = mutation({
	args: mediaUploadArgs,
	returns: v.object({
		result: resultValidator,
		uploadUrl: v.union(v.string(), v.null()),
	}),
	handler: async (ctx: MutationCtx, args: Args) => {
		const auth = await authorize(ctx, args);
		let row = await ctx.db
			.query("contentPromotion_mediaUploads")
			.withIndex("by_transfer_key", (q) => q.eq("transferKey", auth.key))
			.unique();
		if (!row || row.status === "issued")
			await allowedSize(ctx, auth.media.fileSize);
		if (row) check(row, auth);
		else {
			const id = await ctx.db.insert("contentPromotion_mediaUploads", {
				transferKey: auth.key,
				operatorId: auth.user._id,
				sourceIdentityJson: JSON.stringify(auth.source),
				targetIdentityJson: JSON.stringify(auth.target),
				...auth.media,
				status: "issued",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			row = (await ctx.db.get(id))!;
		}
		if (row.status === "verified") {
			if (!row.storageId)
				fail(
					"PROMOTION_MEDIA_INVALID",
					"Verified intent is missing its storage evidence.",
				);
			await verify(ctx, row, row.storageId);
		}
		return {
			result: summary(row),
			uploadUrl:
				row.status === "issued" ? await ctx.storage.generateUploadUrl() : null,
		};
	},
});
export const complete: RegisteredMutation<
	"public",
	Args & {
		intentId: Id<"contentPromotion_mediaUploads">;
		storageId: Id<"_storage">;
	},
	MediaUploadResult
> = mutation({
	args: {
		...mediaUploadArgs,
		intentId: v.id("contentPromotion_mediaUploads"),
		storageId: v.id("_storage"),
	},
	returns: resultValidator,
	handler: async (
		ctx: MutationCtx,
		args: Args & {
			intentId: Id<"contentPromotion_mediaUploads">;
			storageId: Id<"_storage">;
		},
	) => {
		const auth = await authorize(ctx, args);
		const row = await ctx.db.get(args.intentId);
		if (!row) fail("PROMOTION_MEDIA_INVALID", "Upload intent is unavailable.");
		check(row, auth);
		if (row.storageId && row.storageId !== args.storageId)
			fail(
				"PROMOTION_MEDIA_INVALID",
				"This intent already owns different storage.",
			);
		if (row.status !== "verified") await allowedSize(ctx, row.fileSize);
		await verify(ctx, row, args.storageId);
		if (row.status !== "verified")
			await ctx.db.patch("contentPromotion_mediaUploads", row._id, {
				status: "verified",
				storageId: args.storageId,
				updatedAt: Date.now(),
			});
		return summary({ ...row, status: "verified", storageId: args.storageId });
	},
});
export const status: RegisteredQuery<"public", Args, MediaUploadResult | null> =
	query({
		args: mediaUploadArgs,
		returns: v.union(resultValidator, v.null()),
		handler: async (ctx: QueryCtx, args: Args) => {
			const auth = await authorize(ctx, args);
			const row = await ctx.db
				.query("contentPromotion_mediaUploads")
				.withIndex("by_transfer_key", (q) => q.eq("transferKey", auth.key))
				.unique();
			if (!row) return null;
			check(row, auth);
			if (row.storageId) await verify(ctx, row, row.storageId);
			return summary(row);
		},
	});
