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
import {
	hasStructuredContent,
	type StructuredContentProps,
} from "@/components/blog/StructuredContent";
import type { RestrictedTeaserMode } from "@/components/membership/RestrictedContent";
import { SeoHead } from "@/components/seo/SeoHead";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageOverrides } from "@/contexts/PageOverridesContext";
import { estimateReadingTime } from "@/lib/blog/renderContent";
import type {
	AuthorData,
	BlockDocument,
	PostCard as PostCardType,
	PostCategory,
	PostDetail,
	PostTag,
} from "@/lib/blog/types";
import { parseTipTapDocument } from "@/lib/schemas/content";
import { slugParamsSchema } from "@/lib/schemas/routeParams";
import type { PostSeoData, SeoSettings } from "@/lib/seo/resolve";
import { buildSeoHead, siteTitled } from "@/lib/seo/head";
import {
	buildArticleJsonLd,
	createFallbackSeo,
	resolvePostSeoFromQueries,
} from "@/lib/seo/resolve";
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
		if (post.blocksVersion === 2 && canonical === null) throw notFound();

		// Prefetch the membership access decision so SSR renders the correct
		// gated view without a client-side flash. Safe to skip when the post is
		// missing or the membership plugin is off (checkAccess returns `allowed`).
		if (post && typeof post === "object" && "_id" in post && post._id) {
			await queryClient.ensureQueryData(
				convexQuery(api.membership.queries.checkAccess, {
					resourceType: "post",
					resourceIdOrKey: post._id as string,
				}),
			);
		}
		return {
      canonical,
			seoHead: buildSeoHead({
				title:
					post && typeof post === "object" && "title" in post
						? siteTitled(`${post.title}`)
						: siteTitled(`${slug}`),
				description:
					post && typeof post === "object" && "excerpt" in post
						? post.excerpt
						: undefined,
				ogType: "article",
			}),
		};
	},
	head: ({ loaderData }) => ({
		...loaderData?.seoHead,
		links: [
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
	// SSR-safe origin: start empty to avoid hydration mismatch
	const [siteUrl, setSiteUrl] = useState("");
	const [submittedPassword, setSubmittedPassword] = useState<string | null>(
		null,
	);
	const [passwordError, setPasswordError] = useState<string | undefined>(
		undefined,
	);
	const [isVerifying, setIsVerifying] = useState(false);
	useEffect(() => {
		setSiteUrl(window.location.origin);
	}, []);
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
	// Fetch per-post SEO metadata (only when post is loaded)
	const postSeoData = useQuery(
		api.seo.queries.getPostSeo,
		rawPost?._id ? { postId: rawPost._id as Id<"posts"> } : "skip",
	);
	// Fetch global SEO settings (for title templates, social defaults, schema config)
	const seoSettings = useQuery(api.seo.queries.getSettings, {});
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

	// Parse block content using Zod validation
	const blockContent = resolvedPostData.content
		? (parseTipTapDocument(resolvedPostData.content) as BlockDocument | null)
		: null;
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
			content: blockContent,
			contentMode:
				((resolvedPostData as { contentMode?: PostDetail["contentMode"] }).contentMode ??
					"article"),
			blocks: (resolvedPostData as { blocks?: PostDetail["blocks"] }).blocks ?? undefined,
			blocksVersion:
				(resolvedPostData as { blocksVersion?: number }).blocksVersion ?? undefined,
			blocksRevision:
				(resolvedPostData as { blocksRevision?: number }).blocksRevision ?? undefined,
		featuredImageUrl: resolvedPostData.featuredImageUrl ?? undefined,
		featuredImageAlt: resolvedPostData.featuredImageAlt ?? undefined,
		publishedAt: resolvedPostData.publishedAt
			? new Date(resolvedPostData.publishedAt).toISOString()
			: undefined,
		readingTime: estimateReadingTime(resolvedPostData.content),
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
	// Build share URL (siteUrl is already set via useEffect for SSR safety)
	const shareUrl = siteUrl ? `${siteUrl}/blog/${slug}` : `/blog/${slug}`;
	// ── SEO Resolution ──────────────────────────────────────────────────────
	// Resolve SEO data using the fallback chain when all queries have loaded.
	// While loading, use a sensible fallback based on the post title.
	const resolvedSeo =
		postSeoData && seoSettings && siteUrl
			? resolvePostSeoFromQueries(
					{
						title: post.title,
						slug: post.slug,
						type: "post",
						excerpt: post.excerpt,
						content: rawPost.content,
						featuredImageUrl: post.featuredImageUrl,
						publishedAt: post.publishedAt,
					},
					postSeoData as PostSeoData,
					seoSettings as unknown as SeoSettings,
					siteUrl,
				)
			: createFallbackSeo(post.title, siteUrl || `/blog/${slug}`);
	// Build JSON-LD structured data graph for the article
	const jsonLdGraph =
		postSeoData && seoSettings && siteUrl
			? buildArticleJsonLd(
					{
						title: post.title,
						slug: post.slug,
						type: "post",
						excerpt: post.excerpt,
						content: rawPost.content,
						featuredImageUrl: post.featuredImageUrl,
						publishedAt: post.publishedAt,
					},
					resolvedSeo,
					seoSettings as unknown as SeoSettings,
					siteUrl,
					{
						name: post.author.displayName,
						url: `${siteUrl}/author/${post.author.slug}`,
						imageUrl: post.author.avatarUrl,
					},
				)
			: undefined;
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
	// AI structured content (hero / topics / summary) wins over TipTap when present.
	const structuredProps: StructuredContentProps = {
		hero: resolvedPostData.hero,
		topics: resolvedPostData.topics,
		summary: resolvedPostData.summary,
		sources: resolvedPostData.sources,
		tableOfContents: resolvedPostData.tableOfContents,
	};
	const structured = hasStructuredContent(structuredProps) ? structuredProps : null;
	return (
		<>
			{/* SEO Meta Tags + JSON-LD: emitted by the route so every template pack keeps them */}
			<SeoHead
				seo={resolvedSeo}
				siteUrl={siteUrl || `/blog/${slug}`}
				jsonLdGraph={jsonLdGraph}
			/>
			<PublicCanonicalScope request={request} documentId={post._id} initial={canonical} password={submittedPassword ?? undefined}>
			<Surface
				name="blog.post"
				data={{
					post,
					author: authorData,
					relatedPosts,
					shareUrl,
					structured,
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
