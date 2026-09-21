import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { socialProvider } from "../schema/socialFeeds";
import {
	approvedAccount,
	mastodonOrigins,
	ownedSource,
	socialFailure,
	socialInstallation,
} from "./policy";
type View = {
	id: Id<"socialFeedSources">;
	provider: "instagram" | "mastodon";
	handle: string;
	enabled: boolean;
	revision: number;
	status: "pending" | "ready" | "failed" | "disabled";
	refreshedAt: number | null;
	expiresAt: number | null;
};
const viewValidator = v.object({
	id: v.id("socialFeedSources"),
	provider: socialProvider,
	handle: v.string(),
	enabled: v.boolean(),
	revision: v.number(),
	status: v.union(
		v.literal("pending"),
		v.literal("ready"),
		v.literal("failed"),
		v.literal("disabled"),
	),
	refreshedAt: v.union(v.number(), v.null()),
	expiresAt: v.union(v.number(), v.null()),
});
const sourceApproved = (source: Doc<"socialFeedSources">): boolean => {
	try {
		approvedAccount(source.provider, source.handle);
		return true;
	} catch {
		return false;
	}
};
const view = (source: Doc<"socialFeedSources">): View => ({
	id: source._id,
	provider: source.provider,
	handle: source.handle,
	enabled: source.enabled,
	revision: source.revision,
	status: !source.enabled
		? "disabled"
		: !sourceApproved(source)
			? "failed"
			: source.cache && source.cache.expiresAt > Date.now()
				? "ready"
				: source.lastError
					? "failed"
					: "pending",
	refreshedAt: source.cache?.refreshedAt ?? null,
	expiresAt: source.cache?.expiresAt ?? null,
});
export const create: RegisteredMutation<
	"public",
	{ provider: "instagram" | "mastodon"; handle: string; enabled: boolean },
	Promise<Id<"socialFeedSources">>
> = mutation({
	args: { provider: socialProvider, handle: v.string(), enabled: v.boolean() },
	returns: v.id("socialFeedSources"),
	handler: async (ctx, args) => {
		const user = await requireCan(ctx, "manage_options"),
			scope = await socialInstallation(ctx),
			handle = approvedAccount(args.provider, args.handle);
		const existing = await ctx.db
			.query("socialFeedSources")
			.withIndex("by_scope_account", (q) =>
				q
					.eq("websiteKey", scope.websiteKey)
					.eq("instanceKey", scope.instanceKey)
					.eq("provider", args.provider)
					.eq("handle", handle),
			)
			.unique();
		if (existing) socialFailure("This account is already connected");
		const sources = await ctx.db
			.query("socialFeedSources")
			.withIndex("by_scope_account", (q) =>
				q
					.eq("websiteKey", scope.websiteKey)
					.eq("instanceKey", scope.instanceKey),
			)
			.take(20);
		if (sources.length >= 20)
			socialFailure(
				"This website has reached its limit of 20 connected sources",
			);
		const now = Date.now();
		return ctx.db.insert("socialFeedSources", {
			...scope,
			provider: args.provider,
			handle,
			enabled: args.enabled,
			revision: 1,
			createdBy: user._id,
			updatedBy: user._id,
			createdAt: now,
			updatedAt: now,
			refreshAttempt: 0,
			nextRefreshAt: now,
		});
	},
});
export const setEnabled: RegisteredMutation<
	"public",
	{
		sourceId: Id<"socialFeedSources">;
		expectedRevision: number;
		enabled: boolean;
	},
	Promise<null>
> = mutation({
	args: {
		sourceId: v.id("socialFeedSources"),
		expectedRevision: v.number(),
		enabled: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await requireCan(ctx, "manage_options"),
			source = await ownedSource(ctx, args.sourceId);
		if (!source) socialFailure("This source is not available in this website");
		if (
			source!.revision !== args.expectedRevision ||
			!Number.isSafeInteger(source!.revision + 1)
		)
			socialFailure("The source changed. Reload it before saving");
		if (args.enabled) approvedAccount(source!.provider, source!.handle);
		await ctx.db.patch("socialFeedSources", source!._id, {
			enabled: args.enabled,
			revision: source!.revision + 1,
			cache: undefined,
			refreshLeaseUntil: undefined,
			lastError: undefined,
			nextRefreshAt: Date.now(),
			updatedAt: Date.now(),
			updatedBy: user._id,
		});
		return null;
	},
});
export const list: RegisteredQuery<
	"public",
	Record<string, never>,
	Promise<{ sources: View[]; approvedMastodonOrigins: string[] }>
> = query({
	args: {},
	returns: v.object({
		sources: v.array(viewValidator),
		approvedMastodonOrigins: v.array(v.string()),
	}),
	handler: async (ctx) => {
		await requireCan(ctx, "manage_options");
		const scope = await socialInstallation(ctx);
		const sources = await ctx.db
			.query("socialFeedSources")
			.withIndex("by_scope_account", (q) =>
				q
					.eq("websiteKey", scope.websiteKey)
					.eq("instanceKey", scope.instanceKey),
			)
			.take(21);
		if (sources.length > 20)
			socialFailure(
				"The connected-source inventory exceeds its supported limit",
			);
		return {
			sources: sources
				.filter((source) => source.deploymentOrigin === scope.deploymentOrigin)
				.map(view),
			approvedMastodonOrigins: [...mastodonOrigins()],
		};
	},
});

/** Changing the account immediately withdraws the old cache and fences in-flight refreshes. */
export const updateAccount: RegisteredMutation<
 "public",
 {sourceId:Id<"socialFeedSources">;expectedRevision:number;handle:string},
 Promise<null>
> = mutation({
 args:{sourceId:v.id("socialFeedSources"),expectedRevision:v.number(),handle:v.string()},
 returns:v.null(),
 handler:async(ctx,args)=>{
  const user=await requireCan(ctx,"manage_options"),source=await ownedSource(ctx,args.sourceId);
  if(!source)socialFailure("This source is not available in this website");
  if(source!.revision!==args.expectedRevision||!Number.isSafeInteger(source!.revision+1))socialFailure("The source changed. Reload it before saving");
  const handle=approvedAccount(source!.provider,args.handle);
  const duplicate=await ctx.db.query("socialFeedSources").withIndex("by_scope_account",q=>q.eq("websiteKey",source!.websiteKey).eq("instanceKey",source!.instanceKey).eq("provider",source!.provider).eq("handle",handle)).unique();
  if(duplicate&&duplicate._id!==source!._id)socialFailure("This account is already connected");
  if(handle===source!.handle)return null;
  await ctx.db.patch("socialFeedSources",source!._id,{handle,revision:source!.revision+1,cache:undefined,refreshLeaseUntil:undefined,lastAttemptAt:undefined,lastError:undefined,nextRefreshAt:Date.now(),updatedAt:Date.now(),updatedBy:user._id});
  return null;
 }
});
/** Disable first so removal cannot silently take a live block offline. */
export const remove: RegisteredMutation<
 "public",
 {sourceId:Id<"socialFeedSources">;expectedRevision:number},
 Promise<null>
> = mutation({
 args:{sourceId:v.id("socialFeedSources"),expectedRevision:v.number()},returns:v.null(),
 handler:async(ctx,args)=>{
  await requireCan(ctx,"manage_options");const source=await ownedSource(ctx,args.sourceId);
  if(!source)socialFailure("This source is not available in this website");
  if(source!.revision!==args.expectedRevision)socialFailure("The source changed. Reload it before removing");
  if(source!.enabled)socialFailure("Disable this source before removing it");
  await ctx.db.delete("socialFeedSources",source!._id);return null;
 }
});
