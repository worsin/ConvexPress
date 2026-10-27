import { canonicalPaginationSearch } from "@/templates/sdk/block-public/pagination-search";
import { loadAnonymousCanonical } from "@/templates/sdk/block-public/anonymous-loader";
import { PublicCanonicalScope } from "@/templates/sdk/block-public/PublicCanonicalBody";
import { useAuth } from "@/lib/auth/clerk";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";

import type { RestrictedTeaserMode } from "@/components/membership/RestrictedContent";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageOverrides } from "@/contexts/PageOverridesContext";
import type {
	AuthorData,
	PostCard as PostCardType,
	PostCategory,
	PostDetail,
	PostTag,
} from "@/lib/blog/types";
import { slugParamsSchema } from "@/lib/schemas/routeParams";
import { getRouteSiteUrl } from "@/lib/seo/head";
import { buildPostSeoHead } from "@/lib/seo/post-head";
import CoreBlogPost from "@/templates/packs/core/surfaces/blog.post";
import CoreNotFound from "@/templates/packs/core/surfaces/system.notFound";
import CorePasswordGate from "@/templates/packs/core/surfaces/system.passwordGate";
import type { RestrictedSurfaceData } from "@/templates/packs/core/surfaces/system.restricted";
import { Surface } from "@/templates/sdk/Surface";
export const Route = createFileRoute("/_marketing/blog/$slug")({
  validateSearch: canonicalPaginationSearch,
  loaderDeps: ({ search }) => ({ request: search.blockPages }),
	// .parse() is intentional here: TanStack Router catches the thrown ZodError
	// and triggers the not-found/error boundary for malformed slug params.
	params: { parse: (raw) => slugParamsSchema.parse(raw) },
	component: SinglePost,
	loader: async ({ context: { queryClient }, params: { slug }, deps }) => {
		// Pre-fetch the post data on the server for SSR
		const post = await queryClient.ensureQueryData(
			convexQuery(api.posts.queries.getPublished, { slug }),
		);
		// A rendered not-found surface alone leaves SSR at HTTP200. Signal the
		// router so missing, draft and private-denied documents return HTTP404.
		if (post === null) throw notFound();
		const canonical = await loadAnonymousCanonical(post, deps.request);
		// Metadata and canonical policy are separate reads. Do not return a
		// successful page if publication/access was revoked between them.
		if (canonical === null) throw notFound();

		const [postSeo, seoSettings] = await Promise.all([
			// The post's SEO fields and Settings › SEO, so the server-rendered page
			// carries the post's whole head (lib/seo/post-head.ts).
			queryClient.ensureQueryData(convexQuery(api.seo.queries.getPostSeo, { postId: post._id })).catch(() => null),
			queryClient.ensureQueryData(convexQuery(api.seo.queries.getSettings, {})).catch(() => null),
			// Prefetch the membership access decision so SSR renders the correct
			// gated view without a client-side flash. checkAccess returns `allowed`
			// when the membership plugin is off.
			queryClient.ensureQueryData(
				convexQuery(api.membership.queries.checkAccess, {
					resourceType: "post",
					resourceIdOrKey: post._id as string,
				}),
			),
		]);
		return {
      canonical,
			// The breadcrumb trail names the post (hooks/layout/useBreadcrumbs.ts).
			title: post.title,
			seoHead: buildPostSeoHead(post, postSeo, seoSettings && "titles" in seoSettings ? seoSettings : null),
		};
	},
	head: ({ loaderData }) => ({
		...loaderData?.seoHead,
		links: [
			...(loaderData?.seoHead.links ?? []),
			{
				rel: "alternate",
				type: "application/rss+xml",
				title: "Comments RSS Feed",
				href: "/api/blog/feed",
			},
			{
				rel: "alternate",
				type: "application/atom+xml",
				title: "Comments Atom Feed",
				href: "/api/blog/feed/atom",
			},
		],
	}),
});
function SinglePost() {
	const { slug } = Route.useParams();
  const {canonical} = Route.useLoaderData();
  const {blockPages: request} = Route.useSearch();
	const { isSignedIn, userId } = useAuth();
	// The site's configured address: the same on the server and in the browser.
	const siteUrl = getRouteSiteUrl();
	const [submittedPassword, setSubmittedPassword] = useState<string | null>(
		null,
	);
	const [passwordError, setPasswordError] = useState<string | undefined>(
		undefined,
	);
	const [isVerifying, setIsVerifying] = useState(false);
	// Fetch post by slug (public, no auth required)
	const { data: rawPost } = useTanStackQuery(
    convexQuery(api.posts.queries.getPublished, { slug }),
  );

	// Propagate per-post layout overrides (hideHeader/hideFooter) to parent layout
	const { setOverrides } = usePageOverrides();
	useEffect(() => {
		if (rawPost) {
			setOverrides({
				hideHeader: rawPost.hideHeader ?? false,
				hideFooter: rawPost.hideFooter ?? false,
				layoutId: rawPost.layoutId ?? undefined,
			});
		}
		return () => setOverrides({});
	}, [
		rawPost?.hideHeader,
		rawPost?.hideFooter,
		rawPost?.layoutId,
		setOverrides,
	]);

	// Fetch taxonomies for this post (only when post is loaded)
	const taxonomies = useQuery(
		api.taxonomies.queries.getByPost,
		rawPost?._id ? { postId: rawPost._id as Id<"posts"> } : "skip",
	);
	// Fetch author profile for AuthorBox (only when post is loaded)
	const authorProfile = useQuery(
		api.profiles.queries.getUserBySlug,
		rawPost?.author?.slug ? { slug: rawPost.author.slug } : "skip",
	);
	// Password verification for protected posts
	const verifiedPost = useQuery(
		api.posts.queries.verifyPostPassword,
		rawPost?.isPasswordProtected && submittedPassword
			? { slug, password: submittedPassword }
			: "skip",
	);

	// Handle password verification result
	useEffect(() => {
		if (
			rawPost?.isPasswordProtected &&
			submittedPassword &&
			verifiedPost !== undefined
		) {
			if (verifiedPost === null && isVerifying) {
				setIsVerifying(false);
				setPasswordError("Incorrect password. Please try again.");
			} else if (verifiedPost !== null && isVerifying) {
				setIsVerifying(false);
			}
		}
	}, [
		rawPost?.isPasswordProtected,
		submittedPassword,
		verifiedPost,
		isVerifying,
	]);

	// Fetch related posts (only when post is loaded)
	const relatedPostsRaw = useQuery(
		api.posts.queries.getRelatedPosts,
		rawPost?._id ? { postId: rawPost._id as Id<"posts">, limit: 3 } : "skip",
	);
	// Fetch adjacent posts for prev/next navigation (only when post is loaded)
	const adjacentPosts = useQuery(
		api.posts.queries.getAdjacentPosts,
		rawPost?._id ? { postId: rawPost._id as Id<"posts"> } : "skip",
	);
	// Membership access check — skip until we know the post id. When the plugin
	// is disabled the query returns `allowed: false, reason: "plugin_disabled"`
	// (actually treated as unrestricted below; see gate logic).
	const access = useQuery(
		api.membership.queries.checkAccess,
		rawPost?._id
			? {
					resourceType: "post" as const,
					resourceIdOrKey: rawPost._id as string,
				}
			: "skip",
	);
	// Loading state
	if (rawPost === undefined) {
		return (
			<div className="flex flex-col gap-6">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-8 w-3/4" />
				<Skeleton className="h-3 w-48" />
				<Skeleton className="aspect-video w-full" />
				<div className="flex flex-col gap-3">
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-2/3" />
				</div>
			</div>
		);
	}
	// Not found
	if (rawPost === null) {
		return <Surface name="system.notFound" data={{ kind: "page" }} fallback={CoreNotFound} />;
	}
	// Password-protected post: show gate until password verified
	if (rawPost.isPasswordProtected && !verifiedPost) {
		return (
			<Surface
				name="system.passwordGate"
				data={{
					kind: "post",
					title: rawPost.title,
					onSubmit: (password: string) => {
						setPasswordError(undefined);
						setIsVerifying(true);
						setSubmittedPassword(password);
					},
					error: passwordError,
					isVerifying,
				}}
				fallback={CorePasswordGate}
			/>
		);
	}
	// Use verified post content when password-protected, otherwise use rawPost
	const resolvedPostData = verifiedPost ?? rawPost;

	// Map taxonomies to typed arrays
	const categories: PostCategory[] = (taxonomies?.categories ?? []).map(
		(cat: NonNullable<typeof taxonomies>["categories"][number]) => ({
			_id: cat._id,
			name: cat.name,
			slug: cat.slug,
			taxonomy: "category" as const,
		}),
	);
	const tags: PostTag[] = (taxonomies?.tags ?? []).map(
		(tag: NonNullable<typeof taxonomies>["tags"][number]) => ({
			_id: tag._id,
			name: tag.name,
			slug: tag.slug,
			taxonomy: "tag" as const,
		}),
	);
	// Build PostDetail
	const post: PostDetail = {
		_id: resolvedPostData._id,
		title: resolvedPostData.title,
		slug: resolvedPostData.slug,
		excerpt: resolvedPostData.excerpt,
		featuredImageUrl: resolvedPostData.featuredImageUrl ?? undefined,
		featuredImageAlt: resolvedPostData.featuredImageAlt ?? undefined,
		publishedAt: resolvedPostData.publishedAt
			? new Date(resolvedPostData.publishedAt).toISOString()
			: undefined,
		readingTime: resolvedPostData.readingTimeMinutes,
		author: {
			_id: resolvedPostData.author?._id ?? "",
			displayName: resolvedPostData.author?.displayName ?? "Unknown",
			slug: resolvedPostData.author?.slug ?? "",
			avatarUrl: resolvedPostData.author?.avatarUrl,
		},
		primaryCategory: categories[0]
			? {
					_id: categories[0]._id,
					name: categories[0].name,
					slug: categories[0].slug,
				}
			: undefined,
		commentCount: resolvedPostData.commentCount ?? 0,
		isSticky: resolvedPostData.isSticky ?? false,
		categories,
		tags,
		previousPost: adjacentPosts?.previous
			? {
					title: adjacentPosts.previous.title,
					slug: adjacentPosts.previous.slug,
				}
			: null,
		nextPost: adjacentPosts?.next
			? { title: adjacentPosts.next.title, slug: adjacentPosts.next.slug }
			: null,
	};
	// Build author data for AuthorBox
	const authorData: AuthorData = {
		_id: post.author._id,
		displayName: post.author.displayName,
		slug: post.author.slug,
		avatarUrl: post.author.avatarUrl,
		bio: authorProfile?.bio ?? undefined,
		websiteUrl: authorProfile?.url ?? undefined,
	};
	const shareUrl = `${siteUrl}/blog/${slug}`;
	// Evaluate membership gate. The `plugin_disabled` short-circuit in the
	// backend returns `allowed: false` with `reason: "plugin_disabled"`; we
	// treat that the same as "no restriction" so content remains visible when
	// the plugin is off site-wide.
	const embeddedAccess =
		(resolvedPostData && "membershipAccess" in resolvedPostData
			? resolvedPostData.membershipAccess
			: null) ??
		(rawPost && "membershipAccess" in rawPost
			? rawPost.membershipAccess
			: null);
	const effectiveAccess = embeddedAccess ?? access ?? null;
	const isAccessRestricted = Boolean(
		effectiveAccess &&
			effectiveAccess.allowed === false &&
			effectiveAccess.reason !== "plugin_disabled",
	);
	const accessRule =
		isAccessRestricted && effectiveAccess ? effectiveAccess : null;
	const teaserMode: RestrictedTeaserMode =
		(accessRule?.teaserMode as RestrictedTeaserMode | null | undefined) ??
		"hide";
	const restrictedExcerpt =
		isAccessRestricted && teaserMode === "excerpt"
			? rawPost.excerpt?.trim() || undefined
			: undefined;

	// Map related posts from query to PostCardType[] for the RelatedPosts component
	const relatedPosts: PostCardType[] = (relatedPostsRaw ?? []).map(
		(rp: NonNullable<typeof relatedPostsRaw>[number]) => ({
			_id: rp._id,
			title: rp.title,
			slug: rp.slug,
			excerpt: rp.excerpt || undefined,
			featuredImageUrl: undefined, // Related posts query returns featuredImageId, not URL
			publishedAt: rp.publishedAt
				? new Date(rp.publishedAt).toISOString()
				: undefined,
			author: {
				_id: "",
				displayName: "",
				slug: "",
			},
			commentCount: 0,
			readingTime: undefined,
		}),
	);
	// Membership gate view model for the `system.restricted` surface (null = unrestricted).
	const restricted: RestrictedSurfaceData | null =
		isAccessRestricted && accessRule
			? {
					mode: teaserMode,
					rule: {
						teaserMode: accessRule.teaserMode as RestrictedTeaserMode | null,
						customMessage: accessRule.customMessage,
						matchingPlanIds: accessRule.matchingPlanIds as
							| Id<"membership_plans">[]
							| null,
					},
					excerpt: restrictedExcerpt,
					userState: isSignedIn ? "logged_in_non_member" : "logged_out",
				}
			: null;
	return (
		<>
			{/* The post's SEO head and JSON-LD come from the route's head(), so every template pack keeps them. */}
			<PublicCanonicalScope request={request} documentId={post._id} initial={canonical} password={submittedPassword ?? undefined}>
			<Surface
				name="blog.post"
				data={{
					post,
					author: authorData,
					relatedPosts,
					shareUrl,
					restricted,
					comments: {
						postId: post._id,
						commentStatus: rawPost.commentStatus ?? "open",
						isLoggedIn: !!isSignedIn,
						currentUserId: userId ?? undefined,
					},
				}}
				fallback={CoreBlogPost}
			/>
      </PublicCanonicalScope>
		</>
	);
}
