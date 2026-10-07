import {storedInstagram} from "../schema/socialFeeds";
import type {StoredInstagram} from "./credentials";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import {
	socialProvider,
	socialProfile,
	socialPost,
} from "../schema/socialFeeds";
import { approvedAccount, ownedSource, socialInstallation } from "./policy";
import {
	socialFeedResultSchema,
	socialFeedMatchesArgs,
	type SocialProfile,
	type SocialPost,
} from "../canonicalDocuments/foundation/socialFeedContracts";
export type RefreshJob = {
	manual: boolean;
	instagram?:StoredInstagram;
	sourceId: Id<"socialFeedSources">;
	revision: number;
	attempt: number;
	provider: "instagram" | "mastodon";
	handle: string;
	websiteKey: string;
	instanceKey: string;
	deploymentOrigin: string;
};
const jobValidator = v.object({
	manual: v.boolean(),
	instagram:v.optional(storedInstagram),
	sourceId: v.id("socialFeedSources"),
	revision: v.number(),
	attempt: v.number(),
	provider: socialProvider,
	handle: v.string(),
	websiteKey: v.string(),
	instanceKey: v.string(),
	deploymentOrigin: v.string(),
});
export const reserve: RegisteredMutation<
	"internal",
	{ sourceId: Id<"socialFeedSources">; manual: boolean },
	Promise<RefreshJob | null>
> = internalMutation({
	args: { sourceId: v.id("socialFeedSources"), manual: v.boolean() },
	returns: v.union(v.null(), jobValidator),
	handler: async (ctx, args) => {
		if (args.manual) await requireCan(ctx, "manage_options");
		const source = await ownedSource(ctx, args.sourceId),
			now = Date.now();
		if (
			!source ||
			!source.enabled ||
			(source.refreshLeaseUntil ?? 0) > now ||
			(args.manual
				? (source.lastAttemptAt ?? 0) + 60000 > now
				: source.nextRefreshAt > now)
		)
			return null;
		approvedAccount(source.provider, source.handle, source.instagram);
		const attempt = source.refreshAttempt + 1;
		if (!Number.isSafeInteger(attempt)) return null;
		await ctx.db.patch("socialFeedSources", source._id, {
			refreshAttempt: attempt,
			refreshLeaseUntil: now + 60000,
			lastAttemptAt: now,
			nextRefreshAt: now + 300000,
		});
		return {
			manual: args.manual,
			...(source.instagram?{instagram:source.instagram}:{}),
			sourceId: source._id,
			revision: source.revision,
			attempt,
			provider: source.provider,
			handle: source.handle,
			websiteKey: source.websiteKey,
			instanceKey: source.instanceKey,
			deploymentOrigin: source.deploymentOrigin,
		};
	},
});
type Finish = {
	job: RefreshJob;
	snapshot: { profile: SocialProfile; items: SocialPost[] } | null;
	error:
		| "configuration"
		| "network"
		| "response"
		| "identity"
		| "rate_limit"
		| null;
};
export const finish: RegisteredMutation<
	"internal",
	Finish,
	Promise<boolean>
> = internalMutation({
	args: {
		job: jobValidator,
		snapshot: v.union(
			v.null(),
			v.object({ profile: socialProfile, items: v.array(socialPost) }),
		),
		error: v.union(
			v.null(),
			v.literal("configuration"),
			v.literal("network"),
			v.literal("response"),
			v.literal("identity"),
			v.literal("rate_limit"),
		),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		if (args.job.manual) await requireCan(ctx, "manage_options");
		const source = await ownedSource(ctx, args.job.sourceId),
			now = Date.now(),
			job = args.job;
		if (
			!source ||
			!source.enabled ||
			source.revision !== job.revision ||
			source.refreshAttempt !== job.attempt ||
			(source.refreshLeaseUntil ?? 0) < now ||
			source.provider !== job.provider ||
			source.handle !== job.handle ||
			source.websiteKey !== job.websiteKey ||
			source.instanceKey !== job.instanceKey ||
			source.deploymentOrigin !== job.deploymentOrigin
		)
			return false;
		approvedAccount(source.provider, source.handle, source.instagram);
		if (args.snapshot && args.error === null) {
			if (
				new TextEncoder().encode(JSON.stringify(args.snapshot)).length > 524288
			)
				throw Error("Social snapshot exceeds its byte budget");
			const result = socialFeedResultSchema.parse({
				provider: source.provider,
				handle: source.handle,
				status: "ready",
				...args.snapshot,
				refreshedAt: now,
				expiresAt: now + 900000,
			});
			if (
				!socialFeedMatchesArgs(
					{ provider: source.provider, handle: source.handle, limit: 48 },
					result,
				)
			)
				throw Error("Social account binding mismatch");
			await ctx.db.patch("socialFeedSources", source._id, {
				cache: { ...args.snapshot, refreshedAt: now, expiresAt: now + 900000 },
				lastError: undefined,
				refreshLeaseUntil: undefined,
				nextRefreshAt: now + 600000,
			});
			return true;
		}
		if (args.snapshot || args.error === null)
			throw Error("Invalid social refresh outcome");
		await ctx.db.patch("socialFeedSources", source._id, {
			cache: undefined,
			lastError: args.error,
			refreshLeaseUntil: undefined,
			nextRefreshAt: now + 300000,
		});
		return true;
	},
});
export const due: RegisteredQuery<
	"internal",
	Record<string, never>,
	Promise<Id<"socialFeedSources">[]>
> = internalQuery({
	args: {},
	returns: v.array(v.id("socialFeedSources")),
	handler: async (ctx) => {
		const site = await ctx.db
			.query("convexpress_siteIdentity")
			.withIndex("by_identity_key", (q) => q.eq("identityKey", "site-identity"))
			.unique();
		if (!site) return [];
		const scope = site;
		const rows = await ctx.db
			.query("socialFeedSources")
			.withIndex("by_scope_enabled_due", (q) =>
				q
					.eq("websiteKey", scope.websiteKey)
					.eq("instanceKey", scope.instanceKey)
					.eq("enabled", true)
					.lte("nextRefreshAt", Date.now()),
			)
			.take(20);
		return rows
			.filter((row) => row.deploymentOrigin === scope.deploymentOrigin)
			.map((row) => row._id);
	},
});
