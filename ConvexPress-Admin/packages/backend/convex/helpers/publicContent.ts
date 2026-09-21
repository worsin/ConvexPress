import type { RequestReadLedger } from "./requestReadLedger";
import { publicAuthorProfile } from "./publicAuthor";
import { contentMembershipPaths } from "./contentMembershipPaths";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
	getCurrentUser,
	currentUserCan,
	getCurrentRoleLevel,
} from "./permissions";
import { createMembershipAccessEvaluator, evaluateMembershipAccess } from "../membership/access";

type Content = Doc<"posts">;

/** Editorial access is distinct from a customer session or membership entitlement. */
export async function canEditContent(
	ctx: QueryCtx,
	post: Content,
	budget?: RequestReadLedger,
): Promise<boolean> {
	const user = await getCurrentUser(ctx, budget);
	if (!user || user.status !== "active") return false;
	return (
		(await currentUserCan(
			ctx,
			post.type === "page" ? "page.update" : "post.update",
			budget,
		)) &&
		(String(post.authorId) === String(user._id) ||
			(await getCurrentRoleLevel(ctx, budget)) >= 80)
	);
}

async function canReadPrivateContent(
	ctx: QueryCtx,
	post: Content,
  budget?: RequestReadLedger,
): Promise<boolean> {
	const user = await getCurrentUser(ctx, budget);
	if (!user || user.status !== "active") return false;
	return post.type === "page"
		? currentUserCan(ctx, "page.read_private", budget)
		: (await currentUserCan(ctx, "post.read", budget)) &&
				(await getCurrentRoleLevel(ctx, budget)) >= 80;
}

/** Explicit SDK contract. New storage fields are private until added deliberately here. */
function projectContent(
	post: Content,
	includeBody: boolean,
	includeExcerpt: boolean,
) {
  // V2 bodies travel only through the public canonical trust envelope, never
  // through a parallel unvalidated raw block projection.
  const includeAuthoredBody = includeBody && post.blocksVersion !== 2;
	return {
		_id: post._id,
		_creationTime: post._creationTime,
		type: post.type,
		title: post.title,
		slug: post.slug,
		status: post.status,
		visibility: post.visibility,
		authorId: post.authorId,
		featuredImageId: post.featuredImageId,
		commentStatus: post.commentStatus,
		commentCount: post.commentCount,
		isSticky: post.isSticky,
		publishedAt: post.publishedAt,
		createdAt: post.createdAt,
		updatedAt: post.updatedAt,
		parentId: post.parentId,
		menuOrder: post.menuOrder,
		pageTemplate: post.pageTemplate,
		path: post.path,
		depth: post.depth,
		hideHeader: post.hideHeader,
		hideFooter: post.hideFooter,
		layoutId: post.layoutId,
		contentMode: post.contentMode,
		excerpt: includeExcerpt ? post.excerpt : undefined,
		content: includeAuthoredBody ? post.content : undefined,
		blocks: includeAuthoredBody ? post.blocks : undefined,
		blocksVersion: post.blocksVersion === 2 ? 2 : includeAuthoredBody ? post.blocksVersion : undefined,
		blocksRevision: includeAuthoredBody ? post.blocksRevision : undefined,
		pageSections: includeAuthoredBody ? post.pageSections : undefined,
		hero: includeAuthoredBody ? post.hero : undefined,
		topics: includeAuthoredBody ? post.topics : undefined,
		summary: includeAuthoredBody ? post.summary : undefined,
		sources: includeAuthoredBody ? post.sources : undefined,
		tableOfContents: includeAuthoredBody ? post.tableOfContents : undefined,
	};
}

export async function contentMembershipAccess(
	ctx: QueryCtx,
	post: Content,
	path?: string,
	budget?: RequestReadLedger,
) {
	const resource = await evaluateMembershipAccess(ctx, {
		resourceType: post.type,
		resourceIdOrKey: String(post._id),
	}, budget);
	if (!resource.allowed) return resource;
	const paths = await contentMembershipPaths(ctx, post, path, budget);
	for (const resourceIdOrKey of paths) {
		const access = await evaluateMembershipAccess(ctx, { resourceType: "route", resourceIdOrKey }, budget);
		if (!access.allowed) return access;
	}
	return resource;
}

/** Public/detail projection; callers must separately opt into full editorial documents. */
export async function readPublicContent(
	ctx: QueryCtx,
	post: Content,
	options: { passwordVerified?: boolean; path?: string } = {},
  budget?: RequestReadLedger,
) {
	if (post.status !== "publish" && post.status !== "private") return null;
	if (
		(post.status === "private" || post.visibility === "private") &&
		!(await canReadPrivateContent(ctx, post, budget))
	)
		return null;
	const membershipAccess = await contentMembershipAccess(
		ctx,
		post,
		options.path,
    budget,
	);
	const isPasswordProtected = post.visibility === "password";
	const includeBody =
		membershipAccess.allowed &&
		(!isPasswordProtected || !!options.passwordVerified);
	const includeExcerpt =
		(!isPasswordProtected || !!options.passwordVerified) &&
		(membershipAccess.allowed || membershipAccess.teaserMode === "excerpt");
	return {
		...projectContent(post, includeBody, includeExcerpt),
		isPasswordProtected,
		passwordVerified: !!options.passwordVerified,
		isMembershipRestricted: !membershipAccess.allowed,
		membershipAccess,
	};
}

/** Feeds/search have no password exchange and must recheck the current source document. */
export async function canDiscoverContent(
	ctx: QueryCtx,
	post: Content,
	budget?: RequestReadLedger,
): Promise<boolean> {
	return (
		post.status === "publish" &&
		post.visibility === "public" &&
		(await contentMembershipAccess(ctx, post, undefined, budget)).allowed
	);
}

export async function publicContentAuthor(ctx: QueryCtx, post: Content) {
	const author = await ctx.db.get("users", post.authorId);
	return publicAuthorProfile(author);
}

export async function contentFeaturedImage(ctx: QueryCtx, post: Content) {
	const media = post.featuredImageId
		? await ctx.db.get("media", post.featuredImageId)
		: null;
	if (!media || media.status === "trashed")
		return { featuredImageUrl: undefined, featuredImageAlt: undefined };
	return {
		featuredImageUrl:
			(media.storageId ? await ctx.storage.getUrl(media.storageId) : null) ??
			media.url,
		featuredImageAlt: media.altText,
	};
}

export const PUBLIC_POST_META_KEYS = new Set([
	"_seo_title",
	"_seo_description",
	"_seo_canonical",
	"_seo_og_image",
	"_seo_noindex",
	"_custom_css",
]);

/** Query-local discovery evaluator. Shared route policies are read once per
 * snapshot; never retain this closure across requests or after mutations. */
export function createContentDiscoveryEvaluator(ctx: QueryCtx, budget?: RequestReadLedger) {
  const evaluate = createMembershipAccessEvaluator(ctx, budget);
  return async (post: Content): Promise<boolean> => {
    if (post.status !== "publish" || post.visibility !== "public") return false;
    if (!(await evaluate({resourceType:post.type,resourceIdOrKey:String(post._id)})).allowed) return false;
    for (const resourceIdOrKey of await contentMembershipPaths(ctx, post, undefined, budget))
      if (!(await evaluate({resourceType:"route",resourceIdOrKey})).allowed) return false;
    return true;
  };
}
