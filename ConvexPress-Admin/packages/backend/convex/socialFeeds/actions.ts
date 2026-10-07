import {decryptInstagram} from "./credentials";
import type { RegisteredAction } from "convex/server";
import { makeFunctionReference as ref } from "convex/server";
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { RefreshJob } from "./cache";
import type { MastodonSnapshot } from "./mastodon";
import { fetchMastodonFeed } from "./mastodon";
import { createSocialTransport, SocialProviderError } from "./transport";
import { fetchInstagramFeed, instagramAccount, INSTAGRAM_API_ORIGIN } from "./instagram";
import { mastodonOrigins, mastodonMediaOrigins, instagramMediaOrigins } from "./policy";
type Outcome = { status: "refreshed" | "failed" | "skipped" | "superseded" };
const outcome = v.object({
	status: v.union(
		v.literal("refreshed"),
		v.literal("failed"),
		v.literal("skipped"),
		v.literal("superseded"),
	),
});
const reserve = ref<
	"mutation",
	{ sourceId: Id<"socialFeedSources">; manual: boolean },
	RefreshJob | null
>("socialFeeds/cache:reserve");
const finish = ref<
	"mutation",
	{
		job: RefreshJob;
		snapshot: MastodonSnapshot | null;
		error:
			| "configuration"
			| "network"
			| "response"
			| "identity"
			| "rate_limit"
			| null;
	},
	boolean
>("socialFeeds/cache:finish");
const due = ref<"query", Record<string, never>, Id<"socialFeedSources">[]>(
	"socialFeeds/cache:due",
);
async function refresh(
	ctx: ActionCtx,
	sourceId: Id<"socialFeedSources">,
	manual: boolean,
): Promise<Outcome> {
	const job = await ctx.runMutation(reserve, { sourceId, manual });
	if (!job) return { status: "skipped" };
	let snapshot: MastodonSnapshot;
	try {
		if (job.provider === "instagram") {
			snapshot = await fetchInstagramFeed(
				{ ...(job.instagram?await decryptInstagram(job.handle,job.instagram):instagramAccount(job.handle)), limit: 48, approvedMediaOrigins: job.instagram?new Set(job.instagram.mediaOrigins):instagramMediaOrigins() },
				createSocialTransport(new Set([INSTAGRAM_API_ORIGIN])),
			);
		} else {
			const approvedOrigins = mastodonOrigins();
			snapshot = await fetchMastodonFeed(
				{ handle: job.handle, limit: 48, approvedOrigins, approvedMediaOrigins: mastodonMediaOrigins() },
				createSocialTransport(approvedOrigins),
			);
		}
	} catch (error) {
		const committed = await ctx.runMutation(finish, {
			job,
			snapshot: null,
			error: error instanceof SocialProviderError ? error.code : "response",
		});
		return { status: committed ? "failed" : "superseded" };
	}
	const committed = await ctx.runMutation(finish, {
		job,
		snapshot,
		error: null,
	});
	return { status: committed ? "refreshed" : "superseded" };
}
export const refreshSource: RegisteredAction<
	"public",
	{ sourceId: Id<"socialFeedSources"> },
	Promise<Outcome>
> = action({
	args: { sourceId: v.id("socialFeedSources") },
	returns: outcome,
	handler: (ctx, args) => refresh(ctx, args.sourceId, true),
});
export const refreshDue: RegisteredAction<
	"internal",
	Record<string, never>,
	Promise<null>
> = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const ids = await ctx.runQuery(due, {});
		// Cover the whole bounded source inventory within its15-minute cache lifetime.
		// One failing configuration must not prevent the other accounts refreshing.
		for (let offset = 0; offset < ids.length; offset += 4) {
			await Promise.allSettled(
				ids
					.slice(offset, offset + 4)
					.map((sourceId) => refresh(ctx, sourceId, false)),
			);
		}
		return null;
	},
});
