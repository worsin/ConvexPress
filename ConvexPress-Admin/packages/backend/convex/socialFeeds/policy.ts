import {approvedStoredInstagram,type StoredInstagram} from "./credentials";
import { instagramAccount } from "./instagram";
import type {RequestReadLedger} from "../helpers/requestReadLedger";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
	publicSocialUrl,
	socialAccount,
	type SocialProvider,
} from "../canonicalDocuments/foundation/socialFeedContracts";
export const socialFailure = (message: string): never => {
	throw new ConvexError({ code: "SOCIAL_FEED_CONFIGURATION", message });
};
/** Origins are deployment configuration, never block attributes or provider response links. */
function originSet(
	raw: string | undefined,
	fallback: string[],
): ReadonlySet<string> {
	let values: unknown = fallback;
	try {
		if (raw) values = JSON.parse(raw);
	} catch {
		socialFailure("The approved social server configuration is invalid");
	}
	if (
		!Array.isArray(values) ||
		values.length > 20 ||
		values.some(
			(value) =>
				typeof value !== "string" || publicSocialUrl(value)?.origin !== value,
		)
	)
		socialFailure("The approved social server configuration is invalid");
	return new Set(values as string[]);
}
export function mastodonOrigins() {
	return originSet(process.env.CONVEXPRESS_MASTODON_ORIGINS, [
		"https://mastodon.social",
	]);
}
export function mastodonMediaOrigins() {
	return originSet(process.env.CONVEXPRESS_MASTODON_MEDIA_ORIGINS, [
		"https://files.mastodon.social",
	]);
}
export function instagramMediaOrigins() {
	return originSet(process.env.CONVEXPRESS_INSTAGRAM_MEDIA_ORIGINS, []);
}
export function approvedAccount(
	provider: SocialProvider,
	handle: string,
	stored?: StoredInstagram,
): string {
	const account = socialAccount(provider, handle);
	if (!account) socialFailure("Enter a valid social account handle");
	if (provider === "instagram") {
		try { if(stored){approvedStoredInstagram(account!.handle,stored);return account!.handle;} return instagramAccount(account!.handle).handle; }
		catch { return socialFailure("Ask your site operator to authorize this Instagram professional account for this environment"); }
	}
	if (!mastodonOrigins().has(`https://${account!.host}`))
		socialFailure(
			"This Mastodon server has not been approved for this deployment",
		);
	return account!.handle;
}
export async function socialInstallation(ctx: QueryCtx, budget?: RequestReadLedger) {
 budget?.beforeRead();
	const site = await ctx.db
		.query("convexpress_siteIdentity")
		.withIndex("by_identity_key", (q) => q.eq("identityKey", "site-identity"))
		.unique();
 budget?.record(site);
	if (!site)
		socialFailure("Set up the website before connecting a social feed");
	return {
		websiteKey: site!.websiteKey,
		instanceKey: site!.instanceKey,
		deploymentOrigin: site!.deploymentOrigin,
	};
}
export async function ownedSource(
	ctx: QueryCtx,
	id: Id<"socialFeedSources">,
): Promise<Doc<"socialFeedSources"> | null> {
	const site = await socialInstallation(ctx),
		source = await ctx.db.get("socialFeedSources", id);
	return source &&
		source.websiteKey === site.websiteKey &&
		source.instanceKey === site.instanceKey &&
		source.deploymentOrigin === site.deploymentOrigin
		? source
		: null;
}
