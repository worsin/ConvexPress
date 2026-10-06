import {RequestReadLedger} from "../helpers/requestReadLedger";
import {DATA_LIMITS,encodedBytes} from "../canonicalDocuments/foundation/contracts";
import type { QueryCtx } from "../_generated/server";
import {
	socialInstallation,
	approvedAccount,
	mastodonMediaOrigins,
	instagramMediaOrigins,
} from "./policy";
import {
	socialAccount,
	publicSocialUrl,
	socialFeedArgsSchema,
	socialFeedResultSchema,
	socialFeedMatchesArgs,
	type SocialFeedArgs,
	type SocialFeedResult,
} from "../canonicalDocuments/foundation/socialFeedContracts";
/** Cached public display only: reads never enqueue or contact a provider. */
export async function readSocialFeed(
	ctx: QueryCtx,
	input: SocialFeedArgs,
 budget=new RequestReadLedger(),
): Promise<SocialFeedResult> {
	const args = socialFeedArgsSchema.parse(input),
		missing: SocialFeedResult = {
			provider: args.provider,
			handle: args.handle,
			status: "unavailable",
			profile: null,
			items: [],
			refreshedAt: null,
			expiresAt: null,
		};
	const account = socialAccount(args.provider, args.handle);
	if (!account) return missing;

	const scope = await socialInstallation(ctx,budget);
 budget.beforeRead();
	const source = await ctx.db
		.query("socialFeedSources")
		.withIndex("by_scope_account", (q) =>
			q
				.eq("websiteKey", scope.websiteKey)
				.eq("instanceKey", scope.instanceKey)
				.eq("provider", args.provider)
				.eq("handle", account.handle),
		)
		.unique();
 budget.record(source);
	if (
		!source ||
		!source.enabled ||
		source.deploymentOrigin !== scope.deploymentOrigin ||
		!source.cache ||
		source.cache.refreshedAt > Date.now() ||
		source.cache.expiresAt <= Date.now()
	)
		return missing;
	try { approvedAccount(args.provider,args.handle,source.instagram); } catch { return missing; }
	budget.noteAuthorizationBoundary(source.cache.expiresAt);
 const mediaOrigins = args.provider === "instagram" ? (source.instagram?new Set(source.instagram.mediaOrigins):instagramMediaOrigins()) : mastodonMediaOrigins();
	const items = source.cache.items.slice(0, args.limit).map((item) => ({
		...item,
		image:
			item.image &&
			mediaOrigins.has(publicSocialUrl(item.image.url)?.origin ?? "")
				? item.image
				: null,
	}));
	const result = socialFeedResultSchema.safeParse({
		provider: args.provider,
		handle: args.handle,
		status: "ready",
		profile: source.cache.profile,
		items,
		refreshedAt: source.cache.refreshedAt,
		expiresAt: source.cache.expiresAt,
	});
	if (!result.success || !socialFeedMatchesArgs(args,result.data)) return missing;
 // Keep complete posts in order within the canonical display envelope budget.
 while (encodedBytes(result.data) > DATA_LIMITS.resultBytes && result.data.items.length) result.data.items.pop();
 return encodedBytes(result.data) <= DATA_LIMITS.resultBytes ? result.data : missing;
}
