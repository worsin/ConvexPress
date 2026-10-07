import { defineTable } from "convex/server";
import { v } from "convex/values";
export const socialProvider = v.union(
	v.literal("instagram"),
	v.literal("mastodon"),
);
export const socialProfile = v.object({
	handle: v.string(),
	name: v.string(),
	url: v.string(),
});
export const socialPost = v.object({
	id: v.string(),
	url: v.string(),
	text: v.string(),
	publishedAt: v.number(),
	image: v.union(
		v.null(),
		v.object({
			url: v.string(),
			alt: v.string(),
			width: v.union(v.number(), v.null()),
			height: v.union(v.number(), v.null()),
		}),
	),
});
export const socialCache = v.object({
	profile: socialProfile,
	items: v.array(socialPost),
	refreshedAt: v.number(),
	expiresAt: v.number(),
});
export const instagramInput = v.object({userId:v.string(),apiVersion:v.string(),accessToken:v.string(),mediaOrigins:v.array(v.string())});
export const storedInstagram = v.object({handle:v.string(),userId:v.string(),apiVersion:v.string(),accessTokenEncrypted:v.string(),mediaOrigins:v.array(v.string())});
export const instagramAuthorization = v.object({userId:v.string(),apiVersion:v.string(),mediaOrigins:v.array(v.string())});
export const socialFeedTables = {
	socialFeedSources: defineTable({
		websiteKey: v.string(),
		instanceKey: v.string(),
		deploymentOrigin: v.string(),
		provider: socialProvider,
		handle: v.string(),
		enabled: v.boolean(),
		revision: v.number(),
		createdBy: v.id("users"),
		updatedBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
		refreshAttempt: v.number(),
		refreshLeaseUntil: v.optional(v.number()),
		lastAttemptAt: v.optional(v.number()),
		nextRefreshAt: v.number(),
		lastError: v.optional(
			v.union(
				v.literal("configuration"),
				v.literal("network"),
				v.literal("response"),
				v.literal("identity"),
				v.literal("rate_limit"),
			),
		),
		cache: v.optional(socialCache),
		instagram: v.optional(storedInstagram),
	})
		.index("by_scope_account", [
			"websiteKey",
			"instanceKey",
			"provider",
			"handle",
		])
		.index("by_scope_enabled_due", [
			"websiteKey",
			"instanceKey",
			"enabled",
			"nextRefreshAt",
		]),
};
